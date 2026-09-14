import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createProgressRoutes } from './progressRoutes';
import { emptyProgress } from '../services/progressRecord';
const store = { getRecord: vi.fn(), saveThinkSupport: vi.fn() };
const version = '2026-09-14T00:00:00Z';
const metadata = { thoughtSupport: { state: '完了' }, thinkSupport: { preserve: true }, thinkConversations: { schemaVersion: 1, turns: [] }, keep: 'value' };
const record = { file_id: 'bundle', category: 'bundle', updated_at: version, metadata: JSON.stringify(metadata), content: '本文を保全' };
const input = { ...emptyProgress(), evidence: '本人が確認', remaining: 'なし' };
let server: ReturnType<typeof createServer>, url: string;
beforeEach(async () => {
  vi.clearAllMocks(); store.getRecord.mockResolvedValue({ success: true, data: record }); store.saveThinkSupport.mockResolvedValue({ success: true, data: true });
  const app = express(); app.use(express.json()); app.use(createProgressRoutes(store));
  server = createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/bundles/bundle`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
const put = (changes = {}) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: 'op', expectedVersion: version, confirmed: true, input, ...changes }) });
it('reads without writes and appends without changing P2, P3, legacy data, or content', async () => {
  const read = await (await fetch(url)).json(); expect(read.log.events).toEqual([]); expect(store.saveThinkSupport).not.toHaveBeenCalled();
  const response = await put(); expect(response.status).toBe(200); const saved = await response.json();
  expect(store.saveThinkSupport).toHaveBeenCalledWith('bundle', version, { ...metadata, thinkProgress: saved.log }, saved.version);
  expect(saved.log.events[0]).toMatchObject({ author: 'human', revision: 1, input }); expect(record.content).toBe('本文を保全');
});
it('requires explicit confirmation and blocks stale writes', async () => {
  expect((await put({ confirmed: false })).status).toBe(400);
  expect((await put({ expectedVersion: '2026-09-13T00:00:00Z' })).status).toBe(409);
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
});
it('reports an atomic write conflict without claiming success', async () => {
  store.saveThinkSupport.mockResolvedValue({ success: true, data: false }); expect((await put()).status).toBe(409);
});
it('retries an acknowledged-lost save idempotently even after its base version changed', async () => {
  const saved = await (await put()).json(); store.saveThinkSupport.mockClear();
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, updated_at: saved.version, metadata: JSON.stringify({ ...metadata, thinkProgress: saved.log }) } });
  expect((await put()).status).toBe(200); expect(store.saveThinkSupport).not.toHaveBeenCalled();
  expect((await put({ input: { ...input, evidence: '別の理由' } })).status).toBe(409);
});
it('refuses unknown stored versions and deleted Bundles', async () => {
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, metadata: JSON.stringify({ thinkProgress: { schemaVersion: 2 } }) } });
  expect((await put()).status).toBe(422);
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, is_deleted: true } }); expect((await put()).status).toBe(404);
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
});
