import { id, object, text } from './conversationRecord.js';

export interface ExportSource {
  thinkId: string; title: string; filename: string; contentHash: string;
  observedUpdatedAt: string; hasUnsavedChanges: boolean;
}
export interface ExportManifest {
  schemaVersion: 1; snapshotId: string; vaultId: string; bundleId: string; capturedAt: string;
  normalizationVersion: 'exact-utf8-v1'; status: 'prepared'; quality: 'complete' | 'partial';
  sources: ExportSource[]; issues: string[];
}
export interface ExternalInput {
  vaultId: string; accountKey: string; provider: 'notebooklm-manual'; notebookUrl: string;
  manifest: ExportManifest | null;
}
export interface ExternalEvent { id: string; recordedAt: string; input: ExternalInput }
export interface ExternalLog { schemaVersion: 1; events: ExternalEvent[] }

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}

// This is a link, never a server fetch target. Strip authuser/query/fragment so no tokens are persisted.
export function notebookUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'notebooklm.google.com' || url.port || url.username || url.password
    || !/^\/notebook\/[A-Za-z0-9_-]{1,200}\/?$/.test(url.pathname)) throw new Error('NotebookLMの https://notebooklm.google.com/notebook/… リンクを入力してください。');
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}
export function validateManifest(value: unknown): asserts value is ExportManifest {
  if (!object(value) || !onlyKeys(value, ['schemaVersion', 'snapshotId', 'vaultId', 'bundleId', 'capturedAt', 'normalizationVersion', 'status', 'quality', 'sources', 'issues'])
    || value.schemaVersion !== 1 || !id(value.snapshotId) || !id(value.vaultId) || !id(value.bundleId)
    || !text(value.capturedAt, 40) || !Number.isFinite(Date.parse(value.capturedAt)) || value.normalizationVersion !== 'exact-utf8-v1'
    || value.status !== 'prepared' || !['complete', 'partial'].includes(String(value.quality))
    || !Array.isArray(value.issues) || value.issues.length > 1000 || !value.issues.every(i => text(i, 2000))
    || !Array.isArray(value.sources) || value.sources.length > 300) throw new Error('書き出し記録が不正です。');
  const ids = new Set<string>();
  for (const s of value.sources) {
    if (!object(s) || !onlyKeys(s, ['thinkId', 'title', 'filename', 'contentHash', 'observedUpdatedAt', 'hasUnsavedChanges'])
      || !id(s.thinkId) || ids.has(s.thinkId) || !text(s.title, 2000, true)
      || s.filename !== `${s.thinkId}.md` || typeof s.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(s.contentHash)
      || !text(s.observedUpdatedAt, 100, true) || typeof s.hasUnsavedChanges !== 'boolean') throw new Error('書き出し資料が不正です。');
    ids.add(s.thinkId);
  }
}
export function validateExternalInput(value: unknown, bundleId: string): asserts value is ExternalInput {
  if (!object(value) || !onlyKeys(value, ['vaultId', 'accountKey', 'provider', 'notebookUrl', 'manifest'])
    || !id(value.vaultId) || !id(value.accountKey) || value.provider !== 'notebooklm-manual'
    || !text(value.notebookUrl, 1000) || notebookUrl(value.notebookUrl) !== value.notebookUrl) throw new Error('連携先の記録が不正です。');
  if (value.manifest !== null) {
    validateManifest(value.manifest);
    if (value.manifest.bundleId !== bundleId || value.manifest.vaultId !== value.vaultId) throw new Error('書き出しの対象が一致しません。');
  }
}
export function readExternalLog(value: unknown, bundleId: string): ExternalLog {
  if (value === undefined) return { schemaVersion: 1, events: [] };
  if (!object(value) || !onlyKeys(value, ['schemaVersion', 'events']) || value.schemaVersion !== 1 || !Array.isArray(value.events) || value.events.length > 100) throw new Error('外部連携履歴が未対応または不正です。');
  const ids = new Set<string>();
  for (const e of value.events) {
    if (!object(e) || !onlyKeys(e, ['id', 'recordedAt', 'input']) || !id(e.id) || ids.has(e.id) || !text(e.recordedAt, 40) || !Number.isFinite(Date.parse(e.recordedAt))) throw new Error('外部連携履歴が不正です。');
    validateExternalInput(e.input, bundleId); ids.add(e.id);
  }
  return value as unknown as ExternalLog;
}
export function latestConnection(log: ExternalLog, vaultId: string, accountKey: string): ExternalInput | undefined {
  return [...log.events].reverse().find(e => e.input.vaultId === vaultId && e.input.accountKey === accountKey)?.input;
}
export function exportDiff(current: ExportManifest, previous: ExportManifest | null) {
  const before = new Map(previous?.sources.map(s => [s.thinkId, s.contentHash]) ?? []);
  const now = new Set(current.sources.map(s => s.thinkId));
  return {
    sources: current.sources.map(s => ({ ...s, change: !before.has(s.thinkId) ? 'added' as const : before.get(s.thinkId) === s.contentHash ? 'unchanged' as const : 'updated' as const })),
    missing: (previous?.sources ?? []).filter(s => !now.has(s.thinkId)),
  };
}
