import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('./apiClient', () => ({ apiFetch: vi.fn() }));
import { webcrypto, createHash } from 'node:crypto';
import { prepareExport } from './ExternalService';
import { exportDiff, latestConnection, notebookUrl, validateManifest } from '../../server/services/externalRecord';
import type { ContextSnapshot, ContextSource } from './contextTypes';
import { emptyContextState } from './legacyContextAdapter';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
const source = (thinkId: string, content = '# 題\r\n本文\n'): ContextSource => ({ thinkId, title: '題', content, contentHash: createHash('sha256').update(content).digest('hex'),
  contentType: 'memo', hashAlgorithm: 'SHA-256', normalizationVersion: 'exact-utf8-v1', observedUpdatedAt: '', origin: 'loaded-memory', hasUnsavedChanges: true });
const snapshot = (sources = [source('s1')]): ContextSnapshot => ({ schemaVersion: 1, snapshotId: 'snap', vaultId: 'vault', bundleId: 'bundle', capturedAt: '2026-09-14T00:00:00Z', quality: 'partial', sources,
  startedAt: '2026-09-14T00:00:00Z', scope: 'bundle-only', consistency: 'captured-client-state', bundle: source('bundle'),
  bundleDefinitions: [source('bundle')], resolvedThinkIds: sources.map(s => s.thinkId), state: emptyContextState(), manualState: null,
  issues: [{ thinkId: 'missing', code: 'missing_think', message: '資料がありません' }] });
it('exports exact UTF-8 text with safe filenames, dirty state and missing-source warnings', async () => {
  const original = snapshot(); const before = JSON.stringify(original); const result = await prepareExport(original);
  expect(result.files).toEqual([{ name: 's1.md', content: '# 題\r\n本文\n' }]);
  expect(result.manifest).toMatchObject({ status: 'prepared', quality: 'partial', issues: ['missing: 資料がありません'] });
  expect(result.manifest.sources[0].hasUnsavedChanges).toBe(true); expect(JSON.stringify(original)).toBe(before);
});
it('rejects unsafe IDs, altered bytes, and manifests claiming verified sync', async () => {
  await expect(prepareExport(snapshot([source('../escape')]))).rejects.toThrow();
  await expect(prepareExport(snapshot([{ ...source('s'), content: 'tampered' }]))).rejects.toThrow('ハッシュ');
  const { manifest } = await prepareExport(snapshot()); expect(() => validateManifest({ ...manifest, status: 'synced' })).toThrow();
});
it('compares hashes by Think ID independent of ordering and detects missing sources', async () => {
  const before = (await prepareExport(snapshot([source('same'), source('updated'), source('missing')]))).manifest;
  const now = (await prepareExport(snapshot([source('updated', 'changed'), source('same'), source('new')]))).manifest;
  const diff = exportDiff(now, before); expect(diff.sources.map(s => s.change)).toEqual(['updated', 'unchanged', 'added']);
  expect(diff.missing.map(s => s.thinkId)).toEqual(['missing']);
});
it('isolates account and vault identities and retains the latest exact association', () => {
  const input = { vaultId: 'v1', accountKey: 'work', provider: 'notebooklm-manual' as const, notebookUrl: 'https://notebooklm.google.com/notebook/a', manifest: null };
  const log = { schemaVersion: 1 as const, events: [{ id: '1', recordedAt: '2026-09-14T00:00:00Z', input },
    { id: '2', recordedAt: '2026-09-14T00:00:01Z', input: { ...input, notebookUrl: 'https://notebooklm.google.com/notebook/b' } }] };
  expect(latestConnection(log, 'v1', 'work')?.notebookUrl).toContain('/b');
  expect(latestConnection(log, 'v2', 'work')).toBeUndefined(); expect(latestConnection(log, 'v1', 'personal')).toBeUndefined();
});
it('canonicalizes notebook links and blocks credentials, foreign hosts, or executable schemes', () => {
  expect(notebookUrl('https://notebooklm.google.com/notebook/abc/?authuser=2#token')).toBe('https://notebooklm.google.com/notebook/abc');
  for (const url of ['javascript:alert(1)', 'https://notebooklm.google.com.evil.test/notebook/a', 'https://u:p@notebooklm.google.com/notebook/a', 'http://notebooklm.google.com/notebook/a']) expect(() => notebookUrl(url)).toThrow();
});
