/**
 * firestoreRest.ts
 * Firestore REST API の値の変換・項目の読み取り・設定の取得と、Think 文書の型。
 * FirestoreStorageBackend（とその土台のクラス）が使う。
 */

import type { ThinkMeta } from '../../services/storage/IStorageBackend';

export const DEFAULT_VAULT_ID = 'vault_ver2';
export const FIREBASE_PROJECT_STORAGE_KEY = 'thinktank.web.firebaseProjectId';
/** 約 15MB の複製で画面が止まるので、一覧の表示が落ち着いてから書く */
export const LIST_CACHE_WRITE_DELAY_MS = 3000;

/**
 * Firestoreの保存容量で判定する。JSON転送表現のサイズとは区別する。
 */
export const FIRESTORE_THINK_MAX_BYTES = 1024 * 1024;
export const TOMBSTONE_EXPIRATION_DAYS = 90;
export const TOMBSTONE_EXPIRATION_MS = TOMBSTONE_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

export function fieldsSize(fields: Record<string, FirestoreValue>): number {
  return Object.entries(fields).reduce((sum, [key, value]) => sum + utf8Bytes(key) + 1 + valueSize(value), 0);
}

export function valueSize(value: FirestoreValue): number {
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

export interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  doubleValue?: number;
  timestampValue?: string;
  nullValue?: null;
  mapValue?: { fields?: Record<string, FirestoreValue> };
  arrayValue?: { values?: FirestoreValue[] };
}

export interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export interface FirestoreListResponse {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
}

export interface StoredThinkRecord {
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

export function stringField(fields: Record<string, FirestoreValue>, name: string): string {
  return fields[name]?.stringValue ?? '';
}

export function timestampOrStringField(fields: Record<string, FirestoreValue>, name: string): string {
  return fields[name]?.timestampValue ?? fields[name]?.stringValue ?? '';
}

export function booleanField(fields: Record<string, FirestoreValue>, name: string): boolean {
  return fields[name]?.booleanValue === true;
}

export function integerField(fields: Record<string, FirestoreValue>, name: string): number {
  const value = Number(fields[name]?.integerValue ?? '0');
  return Number.isFinite(value) ? value : 0;
}

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function parseMetadata(raw: string): Record<string, unknown> {
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

export function encodeMetadata(metadata: Record<string, unknown> | undefined): FirestoreValue {
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

export function decodeFirestoreValue(value: FirestoreValue): unknown {
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

export function splitFullContent(fullContent: string): { title: string; body: string } {
  const nlIndex = fullContent.indexOf('\n');
  return nlIndex < 0
    ? { title: fullContent.replace(/\r$/, ''), body: '' }
    : {
        title: fullContent.slice(0, nlIndex).replace(/\r$/, ''),
        body: fullContent.slice(nlIndex + 1),
      };
}

export function getFirebaseProjectId(): string {
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

export function getVaultId(explicit = ''): string {
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

export function firestoreErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const error = (body as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return `HTTP ${status}`;
}

export function isPreconditionFailure(status: number, body: unknown): boolean {
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

export function snapshotFromDocument(thinkid: string, doc: FirestoreDocument): ThinkSnapshotRecord {
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