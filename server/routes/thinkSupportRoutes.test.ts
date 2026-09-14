import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
const bq = vi.hoisted(() => ({ getRecord: vi.fn(), saveThinkSupport: vi.fn() }));
vi.mock('../services/BigQueryService.js', () => ({ bigqueryService: bq }));
import { createBigQueryRoutes } from './bigqueryRoutes';
import { emptyThinkValues } from '../services/thinkSupportRecord';
const version = '2026-09-13T00:00:00.000Z';
const old = { file_id: '2026-09-13-100000', category: 'bundle', updated_at: version, title: '課題', content: 'untouched', metadata: JSON.stringify({ thoughtSupport: { decisions: '旧決定' }, unrelated: { keep: true } }) };
let server: ReturnType<typeof createServer>;
let url: string;
beforeEach(async () => {
  vi.clearAllMocks(); bq.getRecord.mockResolvedValue({ success: true, data: old }); bq.saveThinkSupport.mockResolvedValue({ success: true, data: true });
  const app = express(); app.use(express.json()); app.use(createBigQueryRoutes()); server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/files/${old.file_id}/think-support`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
function put(changes = {}) {
  return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: { ...emptyThinkValues(), goal: '手動目的' }, sources: {}, confirmed: true, expectedVersion: version, ...changes }) });
}
it('reads without writes, then preserves all old metadata in a confirmed manual record', async () => {
  expect((await (await fetch(url)).json()).metadata.thoughtSupport.decisions).toBe('旧決定');
  expect(bq.saveThinkSupport).not.toHaveBeenCalled();
  const response = await put(); expect(response.status).toBe(200);
  const meta = await response.json();
  expect(meta.metadata).toMatchObject({ thoughtSupport: { decisions: '旧決定' }, unrelated: { keep: true }, thinkSupport: { revision: 1, author: 'human', values: { goal: '手動目的' } } });
  expect(bq.saveThinkSupport).toHaveBeenCalledWith(old.file_id, version, meta.metadata, meta.updatedAt);
  expect(old.content).toBe('untouched');
});
it('rejects stale reads without writing', async () => {
  expect((await put({ expectedVersion: '2026-09-12T00:00:00Z' })).status).toBe(409);
  expect(bq.saveThinkSupport).not.toHaveBeenCalled();
});
it('returns conflict if the atomic write loses a race', async () => {
  bq.saveThinkSupport.mockResolvedValue({ success: true, data: false });
  expect((await put()).status).toBe(409);
});
it.each([{ confirmed: false }, { sources: { goal: { thinkId: '../unsafe', contentHash: 'bad' } } }, { values: { goal: 'partial' } }, { expectedVersion: '' }])('rejects invalid input %j', async changes => {
  expect((await put(changes)).status).toBe(400); expect(bq.saveThinkSupport).not.toHaveBeenCalled();
});
it('refuses to overwrite unknown stored versions', async () => {
  bq.getRecord.mockResolvedValue({ success: true, data: { ...old, metadata: JSON.stringify({ thinkSupport: { schemaVersion: 2 } }) } });
  expect((await put()).status).toBe(422); expect(bq.saveThinkSupport).not.toHaveBeenCalled();
});
it('does not turn read failure into a new record', async () => {
  bq.getRecord.mockResolvedValue({ success: false, error: 'offline' });
  expect((await put()).status).toBe(500); expect(bq.saveThinkSupport).not.toHaveBeenCalled();
});
