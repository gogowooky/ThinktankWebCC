/**
 * FirestoreStorageBackend.ts
 *
 * Think の正本を利用者ごとの Firestore コレクションに保存する。
 * Google Drive / ローカル Markdown は正本ではなく、Electron 版で保存に成功した後の
 * best-effort バックアップとしてだけ扱う。
 */

import type {
  IStorageBackend,
  SavePayload,
  ThinkMeta,
} from '../../services/storage/IStorageBackend';
import { StorageConflictError } from '../../services/storage/IStorageBackend';
import { FirebaseAuthService } from './FirebaseAuthService';
import { firestoreUserDocumentsBaseUrl } from '../../../shared/firebaseAuth';
import { inferCreatedAtFromThinkId, isSafeThinkId } from '../../../shared/vaultFormat';
import { nextVersionTimestamp } from '../../../shared/conflict';
import { searchVaultRecords } from '../../../shared/searchIndex';
import { readThinkListCache, writeThinkListCache } from '../../services/storage/thinkListCache';

const DEFAULT_VAULT_ID = 'vault_ver2';
const FIREBASE_PROJECT_STORAGE_KEY = 'thinktank.web.firebaseProjectId';
/** 約 15MB の複製で画面が止まるので、一覧の表示が落ち着いてから書く */
const LIST_CACHE_WRITE_DELAY_MS = 3000;

/**
 * Firestoreの保存容量で判定する。JSON転送表現のサイズとは区別する。
 */
export const FIRESTORE_THINK_MAX_BYTES = 1024 * 1024;
export const TOMBSTONE_EXPIRATION_DAYS = 90;
const TOMBSTONE_EXPIRATION_MS = TOMBSTONE_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

function fieldsSize(fields: Record<string, FirestoreValue>): number {
  return Object.entries(fields).reduce((sum, [key, value]) => sum + utf8Bytes(key) + 1 + valueSize(value), 0);
}

function valueSize(value: FirestoreValue): number {
  if (value.stringValue !== undefined) return utf8Bytes(value.stringValue) + 1;
  if (value.timestampValue !== undefined) return 8;
  if (value.mapValue) return fieldsSize(value.mapValue.fields ?? {}) + 32;
  if (value.arrayValue) return (value.arrayValue.values ?? []).reduce((sum, item) => sum + valueSize(item), 0);
  if (value.booleanValue !== undefined || value.nullValue !== undefined) return 1;
  return 8;
}

export function firestoreThinkDocumentBytes(path: string, fields: Record<string, FirestoreValue>): number {
  return path.split('/').reduce((sum, part) => sum + utf8Bytes(part) + 1, 16) + fieldsSize(fields) + 32;
}

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  doubleValue?: number;
  timestampValue?: string;
  nullValue?: null;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

interface FirestoreListResponse {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
}

interface StoredThinkRecord {
  meta: ThinkMeta;
  body: string;
  firestoreUpdateTime: string;
  payloadParts?: { revision: string; count: number };
  needsCategoryMigration?: boolean;
}

export interface FirestoreThinkRecord {
  meta: ThinkMeta;
  body: string;
}

export interface ThinkSnapshotRecord {
  thinkid: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  sourceUpdatedAt: string;
  snapshotAt: string;
}

export interface ThinkDiffResult {
  thinkid: string;
  hasChanges: boolean;
  titleChanged: boolean;
  bodyChanged: boolean;
  metadataChanged: boolean;
  latest: {
    title: string;
    body: string;
    metadata: Record<string, unknown>;
    updatedAt: string;
  };
  snapshot: ThinkSnapshotRecord;
}

export interface MarkdownImportResult {
  imported: number;
  skipped: number;
  failedIds: string[];
  systemSkipped?: number;
}

function stringField(fields: Record<string, FirestoreValue>, name: string): string {
  return fields[name]?.stringValue ?? '';
}

function timestampOrStringField(fields: Record<string, FirestoreValue>, name: string): string {
  return fields[name]?.timestampValue ?? fields[name]?.stringValue ?? '';
}

function booleanField(fields: Record<string, FirestoreValue>, name: string): boolean {
  return fields[name]?.booleanValue === true;
}

function integerField(fields: Record<string, FirestoreValue>, name: string): number {
  const value = Number(fields[name]?.integerValue ?? '0');
  return Number.isFinite(value) ? value : 0;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseMetadata(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function encodeMetadata(metadata: Record<string, unknown> | undefined): FirestoreValue {
  let normalized: Record<string, unknown>;
  try {
    normalized = JSON.parse(JSON.stringify(metadata ?? {})) as Record<string, unknown>;
  } catch {
    throw new Error('Think のメタデータを JSON に変換できないため保存できません。');
  }
  const encode = (value: unknown): FirestoreValue => {
    if (value === null) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
    if (Array.isArray(value)) {
      if (value.some(Array.isArray)) {
        throw new Error('Firestoreでは配列の直下に配列を保存できません。metadataの構造を確認してください。');
      }
      return { arrayValue: { values: value.map(encode) } };
    }
    return { mapValue: { fields: Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, encode(child)]),
    ) } };
  };
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new Error('Think のmetadataはオブジェクトで指定してください。');
  }
  return encode(normalized);
}

function decodeFirestoreValue(value: FirestoreValue): unknown {
  if (value.mapValue) return Object.fromEntries(
    Object.entries(value.mapValue.fields ?? {}).map(([key, child]) => [key, decodeFirestoreValue(child)]),
  );
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  return null;
}

function splitFullContent(fullContent: string): { title: string; body: string } {
  const nlIndex = fullContent.indexOf('\n');
  return nlIndex < 0
    ? { title: fullContent.replace(/\r$/, ''), body: '' }
    : {
        title: fullContent.slice(0, nlIndex).replace(/\r$/, ''),
        body: fullContent.slice(nlIndex + 1),
      };
}

function getFirebaseProjectId(): string {
  const env =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env) ||
    {};
  let stored = '';
  try {
    stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(FIREBASE_PROJECT_STORAGE_KEY) || ''
        : '';
  } catch {
    // localStorage を使えない環境では build-time 設定を使う。
  }
  return stored || env.VITE_FIREBASE_PROJECT_ID || '';
}

function getVaultId(explicit = ''): string {
  let stored = '';
  try {
    stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem('tt-vault-name') || '' : '';
  } catch {
    // localStorageを利用できない環境では既定値を使う。
  }
  const candidate = (explicit || stored || DEFAULT_VAULT_ID).trim();
  // Firestoreのdocument IDでパス区切りになる文字だけを除外する。
  return candidate && !candidate.includes('/') ? candidate : DEFAULT_VAULT_ID;
}

function firestoreErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const error = (body as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return `HTTP ${status}`;
}

function isPreconditionFailure(status: number, body: unknown): boolean {
  const code =
    body && typeof body === 'object'
      ? (body as { error?: { status?: string } }).error?.status
      : undefined;
  return (
    status === 409 ||
    status === 412 ||
    code === 'ABORTED' ||
    code === 'ALREADY_EXISTS' ||
    code === 'FAILED_PRECONDITION'
  );
}

function snapshotFromDocument(thinkid: string, doc: FirestoreDocument): ThinkSnapshotRecord {
  const fields = doc.fields ?? {};
  const metadata = fields.metadata?.mapValue
    ? (decodeFirestoreValue(fields.metadata) as Record<string, unknown>)
    : parseMetadata(stringField(fields, 'metadataJson'));
  return {
    thinkid,
    title: stringField(fields, 'title'),
    body: stringField(fields, 'body'),
    metadata,
    sourceUpdatedAt: stringField(fields, 'sourceUpdatedAt'),
    snapshotAt: timestampOrStringField(fields, 'snapshotAt') || doc.updateTime || '',
  };
}

export class FirestoreStorageBackend implements IStorageBackend {
  private readonly vaultId: string;
  private records = new Map<string, StoredThinkRecord>();
  private hasLoadedList = false;
  private backupSync: Promise<void> = Promise.resolve();
  private listInFlight: Promise<ThinkMeta[]> | null = null;

  constructor(vaultId = '') {
    this.vaultId = getVaultId(vaultId);
  }

  private async context(): Promise<{
    authHeaders: Record<string, string>;
    collectionUrl: string;
    uid: string;
    projectId: string;
  }> {
    const projectId = getFirebaseProjectId();
    if (!projectId) {
      throw new Error(
        'Firebase Project ID が設定されていません。データ接続設定を確認してください。',
      );
    }
    const auth = await FirebaseAuthService.getAuth();
    const userBaseUrl = firestoreUserDocumentsBaseUrl(projectId, auth.uid);
    return {
      authHeaders: { Authorization: `Bearer ${auth.idToken}` },
      collectionUrl: `${userBaseUrl}/vaults/${encodeURIComponent(this.vaultId)}/thinks`,
      uid: auth.uid,
      projectId,
    };
  }

  private parseDocument(document: FirestoreDocument): StoredThinkRecord | null {
    const fields = document.fields ?? {};
    const fallbackId = document.name?.split('/').pop() ?? '';
    const thinkid = stringField(fields, 'thinkid') || fallbackId;
    if (!isSafeThinkId(thinkid)) return null;

    const title = stringField(fields, 'title');
    const body = stringField(fields, 'body');
    const updatedAt = stringField(fields, 'updatedAt') || document.updateTime || '';
    const createdAt = stringField(fields, 'createdAt') || updatedAt;
    // 新形式を優先し、既存のJSON文字列形式も更新まで読み取り可能にする。
    const metadata = fields.metadata?.mapValue
      ? decodeFirestoreValue(fields.metadata) as Record<string, unknown>
      : parseMetadata(stringField(fields, 'metadataJson'));
    const fullContent = body ? `${title}\n${body}` : title;
    const storedSize = integerField(fields, 'sizeBytes');
    const rawCategory = stringField(fields, 'category') || 'memo';
    const category = rawCategory === 'bundle' ? 'project' : rawCategory === 'abstract' ? 'memo' : rawCategory;

    return {
      meta: {
        thinkid,
        category,
        title,
        keywords: stringField(fields, 'keywords'),
        relatedIds: stringField(fields, 'relatedIds'),
        sizeBytes: storedSize || utf8Bytes(fullContent),
        isDeleted: booleanField(fields, 'isDeleted'),
        createdAt,
        updatedAt,
        metadata,
      },
      body,
      firestoreUpdateTime: document.updateTime || '',
      needsCategoryMigration: rawCategory === 'bundle' || rawCategory === 'abstract',
    };
  }

  private documentFields(record: { meta: ThinkMeta; body: string }): Record<string, FirestoreValue> {
    return {
      schemaVersion: { integerValue: '1' },
      thinkid: { stringValue: record.meta.thinkid },
      category: { stringValue: record.meta.category },
      title: { stringValue: record.meta.title },
      body: { stringValue: record.body },
      keywords: { stringValue: record.meta.keywords || '' },
      relatedIds: { stringValue: record.meta.relatedIds || '' },
      metadata: encodeMetadata(record.meta.metadata),
      sizeBytes: { integerValue: String(record.meta.sizeBytes) },
      isDeleted: { booleanValue: record.meta.isDeleted },
      createdAt: { stringValue: record.meta.createdAt },
      updatedAt: { stringValue: record.meta.updatedAt },
    };
  }

  private async hydrateDocument(document: FirestoreDocument): Promise<StoredThinkRecord | null> {
    const record = this.parseDocument(document);
    const fields = document.fields ?? {};
    const manifest = fields.payloadParts?.mapValue?.fields;
    if (!record || !manifest) return record;
    const revision = stringField(manifest, 'revision');
    const count = integerField(manifest, 'count');
    if (!/^[A-Za-z0-9_-]+$/.test(revision) || !Number.isSafeInteger(count) || count < 1) {
      throw new Error('Thinkの分割保存情報が不正です。');
    }
    record.payloadParts = { revision, count };
    if (record.meta.isDeleted) return record;
    const ctx = await this.context();
    const restored: Record<string, unknown> = { body: '', metadata: {} };
    for (let index = 0; index < count; index++) {
      const response = await fetch(
        `${ctx.collectionUrl}/${encodeURIComponent(record.meta.thinkid)}/payloadParts/${revision}_${index}`,
        { headers: ctx.authHeaders },
      );
      if (!response.ok) throw new Error(`Thinkの分割データ取得に失敗しました (HTTP ${response.status})`);
      const part = await response.json() as FirestoreDocument;
      for (const entry of part.fields?.entries?.arrayValue?.values ?? []) {
        const entryFields = entry.mapValue?.fields ?? {};
        const path = JSON.parse(stringField(entryFields, 'path')) as Array<string | number>;
        if (!path.length || (path[0] !== 'body' && path[0] !== 'metadata') || !entryFields.value) {
          throw new Error('Thinkの分割データが不正です。');
        }
        let target: Record<string | number, unknown> = restored;
        for (let i = 0; i < path.length - 1; i++) {
          const key = path[i];
          if (!Object.prototype.hasOwnProperty.call(target, key)) {
            Object.defineProperty(target, key, { value: typeof path[i + 1] === 'number' ? [] : {}, writable: true, enumerable: true, configurable: true });
          }
          target = target[key] as Record<string | number, unknown>;
        }
        const key = path[path.length - 1];
        const value = decodeFirestoreValue(entryFields.value);
        const next = booleanField(entryFields, 'append') ? String(target[key] ?? '') + String(value) : value;
        Object.defineProperty(target, key, { value: next, writable: true, enumerable: true, configurable: true });
      }
    }
    record.body = restored.body as string;
    record.meta.metadata = restored.metadata as Record<string, unknown>;
    return record;
  }

  /** 大きな本文・metadataを型付き断片にする。metadataの値は子文書でもMap/Array型を保つ。 */
  private splitPayload(fields: Record<string, FirestoreValue>): Array<Record<string, FirestoreValue>> {
    const entries: FirestoreValue[] = [];
    const fragmentLimit = 200 * 1024;
    const add = (path: Array<string | number>, value: FirestoreValue, append = false) => {
      entries.push({ mapValue: { fields: {
        path: { stringValue: JSON.stringify(path) }, value, append: { booleanValue: append },
      } } });
    };
    const visit = (path: Array<string | number>, value: FirestoreValue): void => {
      if (valueSize(value) <= fragmentLimit) { add(path, value); return; }
      if (value.mapValue) {
        for (const [key, child] of Object.entries(value.mapValue.fields ?? {})) visit([...path, key], child);
      } else if (value.arrayValue) {
        (value.arrayValue.values ?? []).forEach((child, index) => visit([...path, index], child));
      } else if (value.stringValue !== undefined) {
        let text = '';
        let bytes = 0;
        let append = false;
        for (const character of value.stringValue) {
          const size = utf8Bytes(character);
          if (bytes + size > fragmentLimit) {
            add(path, { stringValue: text }, append);
            text = ''; bytes = 0; append = true;
          }
          text += character; bytes += size;
        }
        add(path, { stringValue: text }, append);
      } else throw new Error('Thinkの分割保存に対応していない値です。');
    };
    visit(['body'], fields.body);
    visit(['metadata'], fields.metadata);
    const parts: Array<Record<string, FirestoreValue>> = [];
    let batch: FirestoreValue[] = [];
    let bytes = 0;
    for (const entry of entries) {
      const size = valueSize(entry);
      if (batch.length && bytes + size > 600 * 1024) {
        parts.push({ entries: { arrayValue: { values: batch } } }); batch = []; bytes = 0;
      }
      batch.push(entry); bytes += size;
    }
    if (batch.length) parts.push({ entries: { arrayValue: { values: batch } } });
    return parts;
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private async fetchDocument(
    id: string,
    includeDeleted = false,
    skipHydrate = false,
  ): Promise<StoredThinkRecord | null> {
    if (!isSafeThinkId(id)) throw new Error(`不正な thinkid です: ${id}`);
    const ctx = await this.context();
    const response = await fetch(`${ctx.collectionUrl}/${encodeURIComponent(id)}`, {
      headers: ctx.authHeaders,
    });
    if (response.status === 404) {
      this.records.delete(id);
      return null;
    }
    if (!response.ok) {
      const body = await this.readJson(response);
      throw new Error(`Firestore の Think 取得に失敗しました (${firestoreErrorMessage(response.status, body)})`);
    }
    const doc = (await response.json()) as FirestoreDocument;
    const parsed = skipHydrate ? this.parseDocument(doc) : await this.hydrateDocument(doc);
    if (skipHydrate && parsed) {
      const manifest = doc.fields?.payloadParts?.mapValue?.fields;
      if (manifest) {
        const revision = stringField(manifest, 'revision');
        const count = integerField(manifest, 'count');
        if (/^[A-Za-z0-9_-]+$/.test(revision) && Number.isSafeInteger(count) && count >= 1) {
          parsed.payloadParts = { revision, count };
        }
      }
    }
    if (!parsed || (parsed.meta.isDeleted && !includeDeleted)) {
      this.records.delete(id);
      return null;
    }
    this.records.set(id, parsed);
    return parsed;
  }

  public async getRecord(id: string): Promise<FirestoreThinkRecord | null> {
    const record = await this.fetchDocument(id);
    return record ? { meta: record.meta, body: record.body } : null;
  }

  private listCacheKey(uid: string): string {
    return `${getFirebaseProjectId()}/${uid}/${this.vaultId}`;
  }

  public async listMetaCached(): Promise<ThinkMeta[] | null> {
    const uid = FirebaseAuthService.getCurrentUser?.()?.uid;
    return uid ? readThinkListCache(this.listCacheKey(uid)) : null;
  }

  public knownMeta(id: string): ThinkMeta | null {
    return this.records.get(id)?.meta ?? null;
  }

  /** 起動直後は一覧の表示と検索が重なるので、全件の取得は同時に1回だけにする */
  public listMeta(): Promise<ThinkMeta[]> {
    this.listInFlight ??= this.fetchList().finally(() => { this.listInFlight = null; });
    return this.listInFlight;
  }

  private async fetchList(): Promise<ThinkMeta[]> {
    const ctx = await this.context();
    const nextRecords = new Map<string, StoredThinkRecord>();
    const deletedIds = new Set<string>();
    let pageToken = '';

    do {
      const url = new URL(ctx.collectionUrl);
      url.searchParams.set('pageSize', '1000');
      url.searchParams.set('showMissing', 'false');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url.toString(), { headers: ctx.authHeaders });
      if (!response.ok) {
        const body = await this.readJson(response);
        throw new Error(
          `Firestore の Think 一覧取得に失敗しました (${firestoreErrorMessage(
            response.status,
            body,
          )})`,
        );
      }
      const page = (await response.json()) as FirestoreListResponse;
      for (const document of page.documents ?? []) {
        const record = await this.hydrateDocument(document);
        if (!record) continue;
        if (record.meta.isDeleted) deletedIds.add(record.meta.thinkid);
        else nextRecords.set(record.meta.thinkid, record);
      }
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    const toMigrate = [...nextRecords.values()].filter((r) => r.needsCategoryMigration);
    if (toMigrate.length > 0) {
      await this.migrateLegacyCategories(ctx, toMigrate);
    }

    this.records = nextRecords;
    this.hasLoadedList = true;
    // G: 上の数千件のbackup書き出しを待つと一覧表示が数十秒遅れるため、表示後に順番に追従させる
    this.backupSync = this.backupSync
      .then(() => this.syncElectronMarkdownBackups(nextRecords, deletedIds))
      .catch((error) => console.warn('[FirestoreStorageBackend] Markdownバックアップの同期に失敗しました', error));
    const metas = [...nextRecords.values()]
      .map((record) => record.meta)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    setTimeout(() => { void writeThinkListCache(this.listCacheKey(ctx.uid), metas); }, LIST_CACHE_WRITE_DELAY_MS);
    return metas;
  }

  private async migrateLegacyCategories(
    ctx: { authHeaders: Record<string, string>; projectId: string; uid: string },
    records: StoredThinkRecord[],
  ): Promise<void> {
    const batchSize = 400;
    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);
      const writes = chunk.map((record) => ({
        update: {
          name:
            `projects/${ctx.projectId}/databases/(default)/documents/users/${ctx.uid}` +
            `/vaults/${this.vaultId}/thinks/${record.meta.thinkid}`,
          fields: { category: { stringValue: record.meta.category } },
        },
        updateMask: { fieldPaths: ['category'] },
      }));
      try {
        await fetch(
          `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
            ctx.projectId,
          )}/databases/(default)/documents:commit`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
            body: JSON.stringify({ writes }),
          },
        );
        for (const r of chunk) r.needsCategoryMigration = false;
      } catch (err) {
        console.warn('[FirestoreStorageBackend] category migration failed:', err);
      }
    }
  }

  public async getBody(id: string): Promise<string | null> {
    // 別PCで更新された本文を古いメモリcacheから返さないよう、開くたびに正本を確認する。
    const record = await this.fetchDocument(id);
    return record?.body ?? null;
  }

  private async commitDocument(
    id: string,
    fields: Record<string, FirestoreValue>,
    existing: StoredThinkRecord | null,
    requireExistingVersion: boolean,
    extraWrites: Array<Record<string, unknown>> = [],
  ): Promise<string> {
    const ctx = await this.context();
    const documentName = `projects/${ctx.projectId}/databases/(default)/documents/users/${ctx.uid}` +
      `/vaults/${this.vaultId}/thinks/${id}`;
    const documentPath = `users/${ctx.uid}/vaults/${this.vaultId}/thinks/${id}`;
    if (firestoreThinkDocumentBytes(documentPath, fields) > FIRESTORE_THINK_MAX_BYTES - 4096) {
      const parts = this.splitPayload(fields);
      const revision = crypto.randomUUID();
      // 子文書を先に不変の版として保存し、全成功後に親の参照を更新する。
      // 途中失敗・同時更新時にも旧版の本文/metadataは読み続けられる。
      for (let index = 0; index < parts.length; index++) {
        const partName = `${documentName}/payloadParts/${revision}_${index}`;
        if (firestoreThinkDocumentBytes(`${documentPath}/payloadParts/${revision}_${index}`, parts[index]) > FIRESTORE_THINK_MAX_BYTES) {
          throw new Error('分割したThinkの保存容量が上限を超えています。');
        }
        const staged = await fetch(
          `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(ctx.projectId)}/databases/(default)/documents:commit`,
          {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
            body: JSON.stringify({ writes: [{ update: { name: partName, fields: parts[index] }, currentDocument: { exists: false } }] }),
          },
        );
        if (!staged.ok) throw new Error(`Thinkの分割データ保存に失敗しました (HTTP ${staged.status})`);
      }
      fields = {
        ...fields, body: { stringValue: '' }, metadata: { mapValue: { fields: {} } },
        payloadParts: { mapValue: { fields: {
          revision: { stringValue: revision }, count: { integerValue: String(parts.length) },
        } } },
      };
    }
    if (firestoreThinkDocumentBytes(documentPath, fields) > FIRESTORE_THINK_MAX_BYTES) {
      throw new Error('Thinkの基本項目がFirestoreの保存上限を超えています。');
    }
    const currentDocument = requireExistingVersion && existing?.firestoreUpdateTime
      ? { updateTime: existing.firestoreUpdateTime }
      : !existing
        ? { exists: false }
        : undefined;
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        ctx.projectId,
      )}/databases/(default)/documents:commit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
        body: JSON.stringify({
          writes: [
            ...extraWrites,
            {
              update: { name: documentName, fields },
              ...(currentDocument ? { currentDocument } : {}),
            },
          ],
        }),
      },
    );
    const body = await this.readJson(response);
    if (response.ok) {
      const results = (body as { writeResults?: Array<{ updateTime?: string }> } | null)?.writeResults;
      return results?.[results.length - 1]?.updateTime ?? '';
    }
    if (isPreconditionFailure(response.status, body)) {
      const latest = await this.fetchDocument(id).catch(() => null);
      throw new StorageConflictError(id, latest?.meta.updatedAt ?? '');
    }
    throw new Error(
      `Firestore への Think 保存に失敗しました (${firestoreErrorMessage(response.status, body)})`,
    );
  }

  public save(payload: SavePayload): Promise<ThinkMeta> {
    return this.saveRecord(payload);
  }

  private async saveRecord(
    payload: SavePayload,
    importedDates?: { createdAt?: string; updatedAt?: string },
  ): Promise<ThinkMeta> {
    if (!isSafeThinkId(payload.thinkid)) {
      throw new Error(`不正な thinkid です: ${payload.thinkid}`);
    }
    const known = this.reusableRecord(payload);
    if (known) {
      try {
        return await this.commitSave(payload, known, importedDates);
      } catch (error) {
        // 前提の版が古かっただけで本当の衝突とは限らないので、下で読み直して判定する
        if (!(error instanceof StorageConflictError)) throw error;
      }
    }
    const existing = await this.fetchDocument(payload.thinkid, true);
    if (payload.baseUpdatedAt) {
      const currentVersion = existing?.meta.updatedAt ?? '';
      if (!existing || currentVersion !== payload.baseUpdatedAt) {
        throw new StorageConflictError(payload.thinkid, currentVersion);
      }
    }
    return this.commitSave(payload, existing, importedDates);
  }

  /**
   * 直前に読み書きした版なら、本文を読み直さず Firestore の更新時刻を前提条件にして書く。
   * 別の端末が更新していれば Firestore が書き込みを断るので、確認の精度は読み直しと変わらない。
   */
  private reusableRecord(payload: SavePayload): StoredThinkRecord | null {
    const record = this.records.get(payload.thinkid);
    if (!payload.baseUpdatedAt || !record?.firestoreUpdateTime) return null;
    if (record.meta.updatedAt !== payload.baseUpdatedAt) return null;
    return record.meta.isDeleted || record.payloadParts ? null : record;
  }

  private async commitSave(
    payload: SavePayload,
    existing: StoredThinkRecord | null,
    importedDates?: { createdAt?: string; updatedAt?: string },
  ): Promise<ThinkMeta> {
    const { title, body } = splitFullContent(payload.fullContent);
    const updatedAt =
      (!existing && importedDates?.updatedAt) || nextVersionTimestamp(existing?.meta.updatedAt);
    const createdAt =
      existing?.meta.createdAt ||
      importedDates?.createdAt ||
      inferCreatedAtFromThinkId(payload.thinkid, updatedAt);
    const metadata = payload.metadata ?? existing?.meta.metadata ?? {};
    const rawCat = payload.category || existing?.meta.category || 'memo';
    const category = rawCat === 'bundle' ? 'project' : rawCat === 'abstract' ? 'memo' : rawCat;
    const meta: ThinkMeta = {
      thinkid: payload.thinkid,
      category,
      title,
      keywords: payload.keywords ?? existing?.meta.keywords ?? '',
      relatedIds: payload.relatedIds ?? existing?.meta.relatedIds ?? '',
      sizeBytes: utf8Bytes(payload.fullContent),
      isDeleted: false,
      createdAt,
      updatedAt,
      metadata,
    };
    const fields = this.documentFields({ meta, body });
    const firestoreUpdateTime = await this.commitDocument(payload.thinkid, fields, existing, Boolean(payload.baseUpdatedAt));

    this.records.set(payload.thinkid, { meta, body, firestoreUpdateTime });
    await this.writeElectronMarkdownBackup({ meta, body });
    return meta;
  }

  public async delete(id: string): Promise<void> {
    if (!isSafeThinkId(id)) throw new Error(`不正な thinkid です: ${id}`);
    // delete() 契約には期待版がないため、同時更新時だけ最新を読み直して一度再試行する。
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await this.fetchDocument(id, true, true);
      if (!existing) {
        await this.deleteElectronMarkdownBackup(id);
        return;
      }
      if (existing.meta.isDeleted) {
        await this.purgeSnapshots(id, existing.firestoreUpdateTime);
        this.records.delete(id);
        await this.deleteElectronMarkdownBackup(id);
        return;
      }
      const deletedAt = nextVersionTimestamp(existing.meta.updatedAt);
      const deletedAtDate = new Date(deletedAt);
      const expireAtIso = new Date(
        (Number.isNaN(deletedAtDate.getTime()) ? Date.now() : deletedAtDate.getTime()) +
          TOMBSTONE_EXPIRATION_MS,
      ).toISOString();

      // tombstone: 本文やmetadata等の内容を消去し、最小限のメタデータとTTL情報のみ残す
      const tombstoneFields: Record<string, FirestoreValue> = {
        schemaVersion: { integerValue: '1' },
        thinkid: { stringValue: id },
        category: { stringValue: existing.meta.category || 'memo' },
        title: { stringValue: '' },
        body: { stringValue: '' },
        keywords: { stringValue: '' },
        relatedIds: { stringValue: '' },
        metadata: { mapValue: { fields: {} } },
        sizeBytes: { integerValue: '0' },
        isDeleted: { booleanValue: true },
        createdAt: { stringValue: existing.meta.createdAt || deletedAt },
        updatedAt: { stringValue: deletedAt },
        deletedAt: { timestampValue: deletedAt },
        expireAt: { timestampValue: expireAtIso },
      };

      // 分割保存された子ドキュメント（payloadParts）やスナップショットがあればコミットで同時に削除する
      const extraWrites: Array<Record<string, unknown>> = [];
      const ctx = await this.context();
      const documentName = `projects/${ctx.projectId}/databases/(default)/documents/users/${ctx.uid}` +
        `/vaults/${this.vaultId}/thinks/${id}`;
      extraWrites.push({
        delete: `${documentName}/snapshots/current`,
      });
      if (existing.payloadParts) {
        for (let i = 0; i < existing.payloadParts.count; i++) {
          extraWrites.push({
            delete: `${documentName}/payloadParts/${existing.payloadParts.revision}_${i}`,
          });
        }
      }

      let tombstoneTime: string;
      try {
        tombstoneTime = await this.commitDocument(id, tombstoneFields, existing, true, extraWrites);
      } catch (error) {
        if (!(error instanceof StorageConflictError) || attempt > 0) throw error;
        continue;
      }
      this.records.delete(id);
      await this.purgeSnapshots(id, tombstoneTime);
      await this.deleteElectronMarkdownBackup(id);
      return;
    }
  }

  public async search(query: string): Promise<ThinkMeta[]> {
    // Firestoreに全文検索索引は持たせない。一覧ロード済みならその正本snapshotを
    // 再利用し、キー入力のたびに全documentを再読込しない。
    if (!this.hasLoadedList) await this.listMeta();
    return searchVaultRecords(
      [...this.records.values()].map((record) => ({ meta: record.meta, body: record.body })),
      query,
    );
  }

  /** 旧PC版のMarkdown正本を、利用者が明示したときだけFirestoreへ初回移行する。 */
  public async importElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<MarkdownImportResult> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.listMeta) {
      throw new Error('Markdownバックアップを読み込めるPC版で実行してください。');
    }
    const metas = await storage.listMeta();
    const result: MarkdownImportResult = { imported: 0, skipped: 0, failedIds: [], systemSkipped: 0 };
    for (const [index, meta] of metas.entries()) {
      onProgress?.(index, metas.length);
      if (meta.thinkid === '__tt_ui_state__' || meta.thinkid === '__tt_shortcuts__') {
        result.skipped += 1;
        result.systemSkipped = (result.systemSkipped ?? 0) + 1;
        continue;
      }
      if (meta.isDeleted) {
        result.skipped += 1;
        continue;
      }
      try {
        // 既存正本や削除tombstoneは上書きせず、Firestore側を優先する。
        if (await this.fetchDocument(meta.thinkid, true)) {
          result.skipped += 1;
          continue;
        }
        await this.saveFromMarkdownBackup(storage, meta);
        result.imported += 1;
      } catch (error) {
        result.failedIds.push(meta.thinkid);
        console.warn(`[FirestoreStorageBackend] 初回移行に失敗しました (${meta.thinkid})`, error);
      }
    }
    onProgress?.(metas.length, metas.length);
    return result;
  }

  private async saveFromMarkdownBackup(
    storage: NonNullable<NonNullable<Window['electronAPI']>['storage']>,
    meta: ThinkMeta,
  ): Promise<void> {
    const record = storage.getRecord ? await storage.getRecord(meta.thinkid) : null;
    const body = record?.body ?? (await storage.getContent(meta.thinkid)) ?? '';
    const sourceMeta = record?.meta ?? meta;
    await this.saveRecord({
      thinkid: sourceMeta.thinkid,
      category: sourceMeta.category,
      fullContent: body ? `${sourceMeta.title}\n${body}` : sourceMeta.title,
      keywords: sourceMeta.keywords,
      relatedIds: sourceMeta.relatedIds,
      metadata: sourceMeta.metadata,
    }, {
      createdAt: sourceMeta.createdAt,
      updatedAt: sourceMeta.updatedAt,
    });
  }

  /** 一覧を読み直し、削除されていない全 Think を本文付きで返す（ThinkファイルFolder への移行用）。 */
  public async listRecordsForMigration(): Promise<FirestoreThinkRecord[]> {
    await this.listMeta();
    return [...this.records.values()].map((record) => ({ meta: record.meta, body: record.body }));
  }

  /**
   * 移行用。Firestore 側の版（削除済みを含む）より新しいときだけ書き込み、作成・更新日時は移行元の値を保つ。
   * 上書きされる版は書き込み前に beforeOverwrite へ渡す（呼び出し側で退避する）。
   */
  public async importNewerRecord(
    record: FirestoreThinkRecord,
    beforeOverwrite?: (replaced: FirestoreThinkRecord) => Promise<void>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const id = record.meta.thinkid;
    if (!isSafeThinkId(id)) throw new Error(`不正な thinkid です: ${id}`);
    if (!record.meta.updatedAt) throw new Error(`移行元の更新日時がありません: ${id}`);
    const existing = await this.fetchDocument(id, true);
    if (existing && (existing.meta.updatedAt || '') >= record.meta.updatedAt) return 'skipped';
    return this.writeImportedRecord(record, existing, beforeOverwrite);
  }

  /**
   * 上書きコピー用。更新日時に関わらず Firestore の版を置き換える。
   * 更新日時は書き込んだ時刻にする（元の古い日付のままだと、他の端末の一覧キャッシュや
   * バックアップが自分の版のほうが新しいとみなし、上書きが伝わらないため）。作成日時は元の値を保つ。
   */
  public async overwriteRecord(
    record: FirestoreThinkRecord,
    beforeOverwrite?: (replaced: FirestoreThinkRecord) => Promise<void>,
  ): Promise<'created' | 'updated'> {
    const id = record.meta.thinkid;
    if (!isSafeThinkId(id)) throw new Error(`不正な thinkid です: ${id}`);
    const existing = await this.fetchDocument(id, true);
    const updatedAt = new Date().toISOString();
    return this.writeImportedRecord(
      { meta: { ...record.meta, updatedAt }, body: record.body },
      existing,
      beforeOverwrite,
    );
  }

  private async writeImportedRecord(
    record: FirestoreThinkRecord,
    existing: StoredThinkRecord | null,
    beforeOverwrite?: (replaced: FirestoreThinkRecord) => Promise<void>,
  ): Promise<'created' | 'updated'> {
    const id = record.meta.thinkid;
    if (existing && !existing.meta.isDeleted && beforeOverwrite) {
      await beforeOverwrite({ meta: existing.meta, body: existing.body });
    }
    const fullContent = record.body ? `${record.meta.title}\n${record.body}` : record.meta.title;
    const rawCat = record.meta.category || 'memo';
    const meta: ThinkMeta = {
      ...record.meta,
      category: rawCat === 'bundle' ? 'project' : rawCat === 'abstract' ? 'memo' : rawCat,
      keywords: record.meta.keywords || '',
      relatedIds: record.meta.relatedIds || '',
      sizeBytes: utf8Bytes(fullContent),
      isDeleted: false,
      createdAt: record.meta.createdAt || inferCreatedAtFromThinkId(id, record.meta.updatedAt),
      metadata: record.meta.metadata ?? {},
    };
    await this.commitDocument(id, this.documentFields({ meta, body: record.body }), existing, Boolean(existing));
    this.records.set(id, { meta, body: record.body, firestoreUpdateTime: '' });
    await this.writeElectronMarkdownBackup({ meta, body: record.body });
    return existing && !existing.meta.isDeleted ? 'updated' : 'created';
  }

  /** Firestore正本の全データを取得し、PC版のMarkdownバックアップへ一括書き出しする */
  public async exportAllToElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ exported: number; failedIds: string[] }> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.save && !storage?.writeBackup) {
      throw new Error('Markdownバックアップを保存できるPC版で実行してください。');
    }
    const metas = await this.listMeta();
    const result = { exported: 0, failedIds: [] as string[] };
    for (const [index, meta] of metas.entries()) {
      onProgress?.(index, metas.length);
      if (meta.isDeleted) continue;
      try {
        const body = (await this.getBody(meta.thinkid)) ?? '';
        await this.writeElectronMarkdownBackup({ meta, body });
        result.exported += 1;
      } catch (err) {
        result.failedIds.push(meta.thinkid);
        console.warn(`[FirestoreStorageBackend] バックアップ書出しに失敗しました (${meta.thinkid})`, err);
      }
    }
    onProgress?.(metas.length, metas.length);
    return result;
  }

  /** PC版のMarkdownバックアップからFirestoreへ強制的に全件書き戻す（上書き） */
  public async restoreFromElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ restored: number; failedIds: string[] }> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.listMeta) {
      throw new Error('Markdownバックアップを読み込めるPC版で実行してください。');
    }
    const metas = await storage.listMeta();
    const result = { restored: 0, failedIds: [] as string[] };
    for (const [index, meta] of metas.entries()) {
      onProgress?.(index, metas.length);
      if (meta.thinkid === '__tt_ui_state__' || meta.thinkid === '__tt_shortcuts__' || meta.isDeleted) {
        continue;
      }
      try {
        await this.saveFromMarkdownBackup(storage, meta);
        result.restored += 1;
      } catch (err) {
        result.failedIds.push(meta.thinkid);
        console.warn(`[FirestoreStorageBackend] 書き戻しに失敗しました (${meta.thinkid})`, err);
      }
    }
    onProgress?.(metas.length, metas.length);
    return result;
  }

  private async writeElectronMarkdownBackup(record: {
    meta: ThinkMeta;
    body: string;
  }): Promise<void> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.save && !storage?.writeBackup) return;
    const fullContent = record.body
      ? `${record.meta.title}\n${record.body}`
      : record.meta.title;
    const backupPayload = {
      thinkid: record.meta.thinkid,
      category: record.meta.category,
      fullContent,
      keywords: record.meta.keywords,
      relatedIds: record.meta.relatedIds,
      metadata: record.meta.metadata,
      createdAt: record.meta.createdAt,
      updatedAt: record.meta.updatedAt,
    } as SavePayload & { createdAt: string; updatedAt: string };
    try {
      if (storage.writeBackup) await storage.writeBackup(backupPayload);
      else await storage.save(backupPayload);
    } catch (error) {
      console.warn(
        `[FirestoreStorageBackend] Markdown バックアップに失敗しました (${record.meta.thinkid})`,
        error,
      );
    }
  }

  /** Web版や別PCで更新された正本を、PC起動時の一覧取得でローカルbackupへ追従させる。 */
  private async syncElectronMarkdownBackups(
    records: Map<string, StoredThinkRecord>,
    deletedIds: Set<string>,
  ): Promise<void> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.writeBackup) return;
    // 1件ずつ getRecord すると .md を全件読むことになるので、ローカル索引の一覧1回で比較する
    let localUpdatedAt: Map<string, string> | null = null;
    if (storage.listMeta) {
      try {
        localUpdatedAt = new Map((await storage.listMeta()).map((meta) => [meta.thinkid, meta.updatedAt]));
      } catch (error) {
        console.warn('[FirestoreStorageBackend] ローカル索引を読めないため1件ずつ比較します', error);
      }
    }
    for (const id of deletedIds) {
      if (localUpdatedAt && !localUpdatedAt.has(id)) continue;
      await this.deleteElectronMarkdownBackup(id);
    }
    for (const record of records.values()) {
      try {
        const localVersion = localUpdatedAt
          ? localUpdatedAt.get(record.meta.thinkid)
          : (storage.getRecord ? await storage.getRecord(record.meta.thinkid) : null)?.meta.updatedAt;
        if (localVersion === record.meta.updatedAt) continue;
        await this.writeElectronMarkdownBackup(record);
      } catch (error) {
        console.warn(
          `[FirestoreStorageBackend] Markdownバックアップの同期に失敗しました (${record.meta.thinkid})`,
          error,
        );
      }
    }
  }

  private async deleteElectronMarkdownBackup(id: string): Promise<void> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.delete) return;
    try {
      await storage.delete(id);
    } catch (error) {
      console.warn(
        `[FirestoreStorageBackend] Markdown バックアップの削除反映に失敗しました (${id})`,
        error,
      );
    }
  }

  // ── スナップショット機能 ──────────────────────────────────────────

  /** 手動保存ごとに新規文書を作る。過去の snapshots/current も同じ一覧で読める。 */
  public async createSnapshot(thinkid: string): Promise<ThinkSnapshotRecord> {
    if (!isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    const ctx = await this.context();
    const parentName = `projects/${ctx.projectId}/databases/(default)/documents/users/${ctx.uid}/vaults/${this.vaultId}/thinks/${thinkid}`;
    const snapshotId = crypto.randomUUID();
    for (let attempt = 0; ; attempt++) {
      const record = await this.fetchDocument(thinkid);
      if (!record) throw new Error(`対象の Think「${thinkid}」が見つかりません。`);
      const snapshotAt = new Date().toISOString();
      const fields: Record<string, FirestoreValue> = {
        schemaVersion: { integerValue: '1' },
        thinkid: { stringValue: thinkid },
        title: { stringValue: record.meta.title },
        sourceUpdatedAt: { stringValue: record.meta.updatedAt },
        snapshotAt: { timestampValue: snapshotAt },
      };
      if (record.payloadParts) {
        // 大きな本文は元から版単位の不変ドキュメントに保存されている。
        fields.payloadParts = { mapValue: { fields: {
          revision: { stringValue: record.payloadParts.revision },
          count: { integerValue: String(record.payloadParts.count) },
        } } };
      } else {
        fields.body = { stringValue: record.body };
        fields.metadata = encodeMetadata(record.meta.metadata);
      }
      const name = `${parentName}/snapshots/${record.meta.updatedAt}_${snapshotId}`;
      // 同じコミットで親の版を照合する。取得後に削除されたThinkの下に履歴を作らない。
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(ctx.projectId)}/databases/(default)/documents:commit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
        body: JSON.stringify({ writes: [
          { update: { name: parentName, fields: { thinkid: fields.thinkid } }, updateMask: { fieldPaths: ['thinkid'] },
            currentDocument: { updateTime: record.firestoreUpdateTime } },
          { update: { name, fields }, currentDocument: { exists: false },
            updateTransforms: [{ fieldPath: 'snapshotAt', setToServerValue: 'REQUEST_TIME' }] },
        ] }),
      });
      const body = await this.readJson(response);
      if (response.ok) {
        const results = (body as { writeResults?: Array<{ transformResults?: FirestoreValue[] }> } | null)?.writeResults;
        return { thinkid, title: record.meta.title, body: record.body, metadata: record.meta.metadata ?? {},
          sourceUpdatedAt: record.meta.updatedAt, snapshotAt: results?.[1]?.transformResults?.[0]?.timestampValue ?? snapshotAt };
      }
      if (attempt < 2 && isPreconditionFailure(response.status, body)) continue;
      throw new Error(`スナップショットの保存に失敗しました (${firestoreErrorMessage(response.status, body)})`);
    }
  }

  private async *snapshotPages(thinkid: string, params: URLSearchParams): AsyncGenerator<FirestoreDocument[]> {
    if (!isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    const ctx = await this.context();
    const url = `${ctx.collectionUrl}/${encodeURIComponent(thinkid)}/snapshots`;
    for (;;) {
      const response = await fetch(`${url}?${params}`, { headers: ctx.authHeaders });
      if (response.status === 404) return;
      if (!response.ok) {
        const body = await this.readJson(response);
        throw new Error(`スナップショット一覧の取得に失敗しました (${firestoreErrorMessage(response.status, body)})`);
      }
      const page = (await response.json()) as FirestoreListResponse;
      yield page.documents ?? [];
      if (!page.nextPageToken) return;
      params.set('pageToken', page.nextPageToken);
    }
  }

  private async latestSnapshotDocument(thinkid: string): Promise<FirestoreDocument | null> {
    const params = new URLSearchParams({ pageSize: '1', orderBy: 'snapshotAt desc, __name__ desc' });
    for await (const docs of this.snapshotPages(thinkid, params)) {
      if (docs.length) return docs[0];
    }
    return null;
  }

  private async readSnapshot(thinkid: string, doc: FirestoreDocument): Promise<ThinkSnapshotRecord> {
    const snapshot = snapshotFromDocument(thinkid, doc);
    if (doc.fields?.payloadParts) {
      const record = await this.hydrateDocument(doc);
      if (!record) throw new Error('スナップショットの分割データが不正です。');
      snapshot.body = record.body;
      snapshot.metadata = record.meta.metadata ?? {};
    }
    return snapshot;
  }

  public async getSnapshot(thinkid: string): Promise<ThinkSnapshotRecord | null> {
    const doc = await this.latestSnapshotDocument(thinkid);
    return doc ? this.readSnapshot(thinkid, doc) : null;
  }

  /** 旧形式の current を含め、最古から最新の順で返す。 */
  public async listSnapshots(thinkid: string): Promise<ThinkSnapshotRecord[]> {
    const records: ThinkSnapshotRecord[] = [];
    const params = new URLSearchParams({ pageSize: '100', orderBy: 'snapshotAt asc, __name__ asc' });
    for await (const docs of this.snapshotPages(thinkid, params)) {
      for (const doc of docs) records.push(await this.readSnapshot(thinkid, doc));
    }
    return records;
  }

  private async removeSnapshotDocs(docs: FirestoreDocument[]): Promise<void> {
    if (!docs.length) return;
    const ctx = await this.context();
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(ctx.projectId)}/databases/(default)/documents:commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
      body: JSON.stringify({ writes: docs.map(doc => ({
        delete: doc.name, currentDocument: { updateTime: doc.updateTime },
      })) }),
    });
    if (!response.ok) {
      const body = await this.readJson(response);
      throw new Error(`スナップショットの削除に失敗しました (${firestoreErrorMessage(response.status, body)})`);
    }
  }

  /** 一回の破棄で消すのは最新の一件。古い履歴はそのまま使える。 */
  public async deleteSnapshot(thinkid: string): Promise<void> {
    const doc = await this.latestSnapshotDocument(thinkid);
    if (doc) await this.removeSnapshotDocs([doc]);
  }

  /** 親の削除より古い履歴だけを小分けに消す。途中で失敗しても削除を再試行できる。 */
  private async purgeSnapshots(thinkid: string, tombstoneTime: string): Promise<void> {
    // Firestore時刻はUTC・小数部0/3/6/9桁。文字列比較では末尾の Z を除くと順序が揃う。
    const cutoff = tombstoneTime.replace(/Z$/, '');
    const params = new URLSearchParams({ pageSize: '200', 'mask.fieldPaths': 'thinkid' });
    for await (const docs of this.snapshotPages(thinkid, params)) {
      const expired = docs.filter(doc => doc.updateTime && doc.updateTime.replace(/Z$/, '') <= cutoff);
      await this.removeSnapshotDocs(expired);
    }
  }

  /** 最新版とスナップショット版を比較して差分情報を取得する */
  public async getDiff(thinkid: string): Promise<ThinkDiffResult | null> {
    if (!isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    const [latest, snapshot] = await Promise.all([
      this.fetchDocument(thinkid),
      this.getSnapshot(thinkid),
    ]);
    if (!latest || latest.meta.isDeleted || !snapshot) return null;

    const titleChanged = latest.meta.title !== snapshot.title;
    const bodyChanged = latest.body !== snapshot.body;
    const metadataChanged =
      JSON.stringify(latest.meta.metadata ?? {}) !== JSON.stringify(snapshot.metadata ?? {});
    const hasChanges = titleChanged || bodyChanged || metadataChanged;

    return {
      thinkid,
      hasChanges,
      titleChanged,
      bodyChanged,
      metadataChanged,
      latest: {
        title: latest.meta.title,
        body: latest.body,
        metadata: latest.meta.metadata ?? {},
        updatedAt: latest.meta.updatedAt,
      },
      snapshot,
    };
  }
}
