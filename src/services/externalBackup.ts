import { id, object, text } from '../../server/services/conversationRecord';
import { readExternalLog, validateManifest, type ExternalLog, type ExportManifest } from '../../server/services/externalRecord';

export const MAX_EXTERNAL_BACKUP_BYTES = 2100000;
export interface ExternalBackup {
  schemaVersion: 1; kind: 'thinktank-external-backup'; vaultId: string; bundleId: string; exportedAt: string; log: ExternalLog;
}
export type ImportedExternalData = { kind: 'manifest'; manifest: ExportManifest } | { kind: 'history'; backup: ExternalBackup };

export function createExternalBackup(log: ExternalLog, vaultId: string, bundleId: string, exportedAt = new Date().toISOString()): ExternalBackup {
  if (!id(vaultId) || !id(bundleId)) throw new Error('書き出し対象が不正です。');
  readExternalLog(log, bundleId);
  // A Bundle record can contain multiple Vault associations; a backup is scoped to the active Vault.
  const backup: ExternalBackup = { schemaVersion: 1, kind: 'thinktank-external-backup', vaultId, bundleId, exportedAt,
    log: { schemaVersion: 1, events: log.events.filter(e => e.input.vaultId === vaultId) } };
  return structuredClone(backup);
}
export function parseExternalBackup(content: string, vaultId: string, bundleId: string): ImportedExternalData {
  if (new TextEncoder().encode(content).length > MAX_EXTERNAL_BACKUP_BYTES) throw new Error('JSONが容量上限を超えています。');
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error('JSONを読み取れません。'); }
  if (!object(value)) throw new Error('対応表または連携バックアップを選択してください。');
  if ('snapshotId' in value) {
    validateManifest(value);
    if (value.vaultId !== vaultId || value.bundleId !== bundleId) throw new Error('このVault・Bundleの対応表ではありません。');
    return { kind: 'manifest', manifest: value };
  }
  if (value.kind !== 'thinktank-external-backup' || value.schemaVersion !== 1
    || Object.keys(value).some(k => !['schemaVersion', 'kind', 'vaultId', 'bundleId', 'exportedAt', 'log'].includes(k))
    || !id(value.vaultId) || !id(value.bundleId) || !text(value.exportedAt, 40) || !Number.isFinite(Date.parse(value.exportedAt)) || !object(value.log)) {
    throw new Error('対象を確認できない形式です。Vault・Bundle ID付きの連携バックアップ、または対応表JSONを選択してください。');
  }
  if (value.vaultId !== vaultId || value.bundleId !== bundleId) throw new Error('このVault・Bundleのバックアップではありません。');
  const log = readExternalLog(value.log, bundleId);
  if (log.events.some(e => e.input.vaultId !== vaultId)) throw new Error('履歴に別Vaultの記録が含まれています。');
  return { kind: 'history', backup: { schemaVersion: 1, kind: 'thinktank-external-backup', vaultId, bundleId, exportedAt: value.exportedAt, log } };
}
