import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createExternalRoutes } from './externalRoutes';
const store = { getRecord: vi.fn(), saveThinkSupport: vi.fn() };
const version = '2026-09-14T00:00:00Z';
const metadata = { keep: 'legacy', thinkSupport: { preserve: true }, thinkAgents: { preserve: true } };
const record = { file_id: 'bundle', category: 'bundle', updated_at: version, metadata: JSON.stringify(metadata), content: '原本' };
const input = { vaultId: 'vault', accountKey: 'work', provider: 'notebooklm-manual', notebookUrl: 'https://notebooklm.google.com/notebook/n1', manifest: null };
let server: ReturnType<typeof createServer>, url: string;
beforeEach(async () => {
  vi.clearAllMocks(); store.getRecord.mockResolvedValue({ success: true, data: record }); store.saveThinkSupport.mockResolvedValue({ success: true, data: true });
  const app = express(); app.use(express.json()); app.use(createExternalRoutes(store));
  server = createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/bundles/bundle`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
const put = (changes = {}) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: 'op', expectedVersion: version, confirmed: true, input, ...changes }) });
it('reads without writes and preserves all unrelated metadata on save', async () => {
  expect((await (await fetch(url)).json()).log.events).toEqual([]); expect(store.saveThinkSupport).not.toHaveBeenCalled();
  const response = await put(); expect(response.status).toBe(200); const saved = await response.json();
  expect(store.saveThinkSupport).toHaveBeenCalledWith('bundle', version, { ...metadata, thinkExternal: saved.log }, saved.version);
  expect(saved.log.events[0].input).toEqual(input); expect(record.content).toBe('原本');
});
it('requires confirmation and rejects stale or atomic-conflicting writes', async () => {
  expect((await put({ confirmed: false })).status).toBe(400);
  expect((await put({ expectedVersion: '2026-09-13T00:00:00Z' })).status).toBe(409);
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
  store.saveThinkSupport.mockResolvedValue({ success: true, data: false }); expect((await put()).status).toBe(409);
});
it('replays an acknowledged-lost save without appending and rejects changed retry input', async () => {
  const saved = await (await put()).json(); store.saveThinkSupport.mockClear();
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, updated_at: saved.version, metadata: JSON.stringify({ ...metadata, thinkExternal: saved.log }) } });
  expect((await put()).status).toBe(200); expect(store.saveThinkSupport).not.toHaveBeenCalled();
  expect((await put({ input: { ...input, accountKey: 'other' } })).status).toBe(409);
});
it('rejects arbitrary URLs, credential fields, and unknown history versions', async () => {
  expect((await put({ input: { ...input, notebookUrl: 'https://evil.test/notebook/a' } })).status).toBe(422);
  expect((await put({ input: { ...input, apiKey: 'secret' } })).status).toBe(422);
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, metadata: JSON.stringify({ thinkExternal: { schemaVersion: 2 } }) } });
  expect((await put()).status).toBe(422); expect(store.saveThinkSupport).not.toHaveBeenCalled();
});
it('rejects manifests for another Bundle and never reports failed storage as success', async () => {
  const manifest = { schemaVersion: 1, snapshotId: 's', vaultId: 'vault', bundleId: 'other', capturedAt: version,
    normalizationVersion: 'exact-utf8-v1', status: 'prepared', quality: 'complete', sources: [], issues: [] };
  expect((await put({ input: { ...input, manifest } })).status).toBe(422);
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
  store.saveThinkSupport.mockResolvedValue({ success: false, error: 'offline' }); expect((await put()).status).toBe(503);
});
