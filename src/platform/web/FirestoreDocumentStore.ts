/**
 * FirestoreDocumentStore.ts
 * FirestoreStorageBackend の土台。認証と URL の用意、Think 文書の読み取り・変換・書き込みと、
 * Electron 版の Markdown バックアップを受け持つ。子クラスから使うメンバーは protected にしている。
 */

import { type SavePayload, type ThinkMeta, StorageConflictError } from '../../services/storage/IStorageBackend';
import { FirebaseAuthService } from './FirebaseAuthService';
import { firestoreUserDocumentsBaseUrl } from '../../../shared/firebaseAuth';
import { isSafeThinkId } from '../../../shared/vaultFormat';
import { FIRESTORE_THINK_MAX_BYTES, valueSize, firestoreThinkDocumentBytes, type FirestoreValue, type FirestoreDocument, type StoredThinkRecord, stringField, booleanField, integerField, utf8Bytes, parseMetadata, encodeMetadata, decodeFirestoreValue, getFirebaseProjectId, getVaultId, firestoreErrorMessage, isPreconditionFailure } from './firestoreRest';

export abstract class FirestoreDocumentStore {
  protected readonly vaultId: string;

  protected records = new Map<string, StoredThinkRecord>();

  protected hasLoadedList = false;

  protected backupSync: Promise<void> = Promise.resolve();

  protected listInFlight: Promise<ThinkMeta[]> | null = null;

  constructor(vaultId = '') {
    this.vaultId = getVaultId(vaultId);
  }

  protected async context(): Promise<{
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

  protected parseDocument(document: FirestoreDocument): StoredThinkRecord | null {
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

  protected documentFields(record: { meta: ThinkMeta; body: string }): Record<string, FirestoreValue> {
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

  protected async hydrateDocument(document: FirestoreDocument): Promise<StoredThinkRecord | null> {
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
  protected splitPayload(fields: Record<string, FirestoreValue>): Array<Record<string, FirestoreValue>> {
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

  protected async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  protected async fetchDocument(
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

  protected async commitDocument(
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

  protected async writeElectronMarkdownBackup(record: {
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
  protected async syncElectronMarkdownBackups(
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

  protected async deleteElectronMarkdownBackup(id: string): Promise<void> {
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
}
