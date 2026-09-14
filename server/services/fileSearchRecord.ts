import { id, object, text } from './conversationRecord.js';

export interface FileSearchStatus { provider: 'gemini-file-search'; enabled: boolean; connectionId: string | null; mode: 'read-only' }
export interface FileSearchStore {
  name: string; displayName: string; activeDocuments: string | null; pendingDocuments: string | null; failedDocuments: string | null;
}
export interface FileSearchPage { connectionId: string; checkedAt: string; stores: FileSearchStore[]; nextPageToken: string | null }
export function validPageToken(value: unknown): value is string {
  return text(value, 2048, true) && [...value].every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
}
export function storeName(value: unknown): value is string { return typeof value === 'string' && /^fileSearchStores\/[a-z0-9-]{1,40}$/.test(value); }
export function parseFileSearchStatus(value: unknown): FileSearchStatus {
  if (!object(value) || value.provider !== 'gemini-file-search' || typeof value.enabled !== 'boolean' || value.mode !== 'read-only'
    || (value.enabled ? !id(value.connectionId) : value.connectionId !== null)) throw new Error('File Searchの接続設定を読み取れません。');
  return { provider: 'gemini-file-search', enabled: value.enabled, connectionId: value.connectionId as string | null, mode: 'read-only' };
}
export function parseFileSearchPage(value: unknown, connectionId: string): FileSearchPage {
  const count = (v: unknown) => v === null || (typeof v === 'string' && /^\d{1,20}$/.test(v));
  if (!object(value) || value.connectionId !== connectionId || !id(connectionId) || !text(value.checkedAt, 40) || !Number.isFinite(Date.parse(value.checkedAt))
    || !Array.isArray(value.stores) || value.stores.length > 20 || (value.nextPageToken !== null && (!validPageToken(value.nextPageToken) || !value.nextPageToken))) throw new Error('File Searchの一覧形式が不正です。');
  const seen = new Set<string>();
  for (const s of value.stores) {
    if (!object(s) || !storeName(s.name) || seen.has(s.name) || !text(s.displayName, 512, true)
      || !count(s.activeDocuments) || !count(s.pendingDocuments) || !count(s.failedDocuments)) throw new Error('File Searchのストア形式が不正です。');
    seen.add(s.name);
  }
  return value as unknown as FileSearchPage;
}
