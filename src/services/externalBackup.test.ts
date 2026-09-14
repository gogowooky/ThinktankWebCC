import { expect, it } from 'vitest';
import { createExternalBackup, parseExternalBackup, MAX_EXTERNAL_BACKUP_BYTES } from './externalBackup';
import type { ExternalLog, ExportManifest } from '../../server/services/externalRecord';
const manifest: ExportManifest = { schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId: 'bundle', capturedAt: '2026-09-14T00:00:00Z',
  normalizationVersion: 'exact-utf8-v1', status: 'prepared', quality: 'partial', sources: [], issues: ['未確認'] };
const log: ExternalLog = { schemaVersion: 1, events: [{ id: 'op', recordedAt: '2026-09-14T00:00:00Z', input: { vaultId: 'vault', accountKey: 'work', provider: 'notebooklm-manual',
  notebookUrl: 'https://notebooklm.google.com/notebook/id', manifest } }] };
it('round-trips a target-scoped history without altering the source or upgrading sync status', () => {
  const original = JSON.stringify(log); const backup = createExternalBackup(log, 'vault', 'bundle');
  const imported = parseExternalBackup(JSON.stringify(backup), 'vault', 'bundle');
  expect(imported).toEqual({ kind: 'history', backup }); expect(JSON.stringify(log)).toBe(original);
  backup.log.events[0].input.accountKey = 'changed'; expect(log.events[0].input.accountKey).toBe('work');
});
it('imports a standalone manifest only for the exact Vault and Bundle', () => {
  expect(parseExternalBackup(JSON.stringify(manifest), 'vault', 'bundle')).toEqual({ kind: 'manifest', manifest });
  expect(() => parseExternalBackup(JSON.stringify(manifest), 'other', 'bundle')).toThrow('Vault');
  expect(() => parseExternalBackup(JSON.stringify(manifest), 'vault', 'other')).toThrow('Bundle');
});
it('rejects foreign history even when an envelope claims the current target', () => {
  const backup = createExternalBackup(log, 'vault', 'bundle'); backup.log.events[0].input.vaultId = 'other'; backup.log.events[0].input.manifest = null;
  expect(() => parseExternalBackup(JSON.stringify(backup), 'vault', 'bundle')).toThrow('別Vault');
  expect(() => parseExternalBackup(JSON.stringify(createExternalBackup(log, 'vault', 'bundle')), 'vault', 'other')).toThrow('Bundle');
});
it('rejects unscoped old histories, unknown formats, malicious URLs and credential fields', () => {
  expect(() => parseExternalBackup(JSON.stringify(log), 'vault', 'bundle')).toThrow('対象');
  for (const change of [{ notebookUrl: 'javascript:alert(1)' }, { apiKey: 'secret' }]) {
    const backup = createExternalBackup(log, 'vault', 'bundle'); Object.assign(backup.log.events[0].input, change);
    expect(() => parseExternalBackup(JSON.stringify(backup), 'vault', 'bundle')).toThrow();
  }
  expect(() => parseExternalBackup(JSON.stringify({ ...manifest, schemaVersion: 2 }), 'vault', 'bundle')).toThrow();
});
it('enforces file limits and rejects embedded bodies and false synchronization claims', () => {
  expect(() => parseExternalBackup(' '.repeat(MAX_EXTERNAL_BACKUP_BYTES + 1), 'vault', 'bundle')).toThrow('容量');
  expect(() => parseExternalBackup('{broken', 'vault', 'bundle')).toThrow('JSON');
  for (const change of [{ content: 'unexpected body' }, { status: 'synced' }]) expect(() => parseExternalBackup(JSON.stringify({ ...manifest, ...change }), 'vault', 'bundle')).toThrow();
});
it('exports only the active Vault from a mixed association log', () => {
  const mixed: ExternalLog = { schemaVersion: 1, events: [...log.events, { ...log.events[0], id: 'other', input: { ...log.events[0].input, vaultId: 'other', manifest: null } }] };
  expect(createExternalBackup(mixed, 'vault', 'bundle').log.events).toHaveLength(1);
});
