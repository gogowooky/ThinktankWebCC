import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createFileSearchRoutes } from './fileSearchRoutes';
const provider = { status: vi.fn(), listStores: vi.fn(), getStore: vi.fn() };
const bindings = { read: vi.fn(), save: vi.fn() };
let server: ReturnType<typeof createServer>, url: string;
beforeEach(async () => {
  vi.clearAllMocks(); provider.status.mockReturnValue({ provider: 'gemini-file-search', enabled: true, connectionId: 'work', mode: 'read-only' });
  provider.listStores.mockResolvedValue({ connectionId: 'work', checkedAt: '2026-09-14T00:00:00Z', stores: [], nextPageToken: null });
  bindings.read.mockResolvedValue({ bundleId: 'b', version: '2026-09-14T00:00:00Z', log: { schemaVersion: 1, events: [] } });
  bindings.save.mockResolvedValue({ bundleId: 'b', version: '2026-09-14T00:00:01Z', log: { schemaVersion: 1, events: [] } });
  const app = express(); app.use(express.json()); app.use(createFileSearchRoutes(provider, bindings)); server = createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
it('reads configuration without listing stores and returns non-cacheable pages', async () => {
  expect((await fetch(`${url}/status`)).status).toBe(200); expect(provider.listStores).not.toHaveBeenCalled();
  const response = await fetch(`${url}/stores?connectionId=work&pageToken=opaque%2B%2F%3D`);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(provider.listStores).toHaveBeenCalledWith('work', 'opaque+/=', expect.any(AbortSignal));
});
it('rejects malformed input and has no upload or creation endpoint', async () => {
  expect((await fetch(`${url}/stores?connectionId=work&connectionId=other`)).status).toBe(400);
  expect((await fetch(`${url}/stores?connectionId=work&pageToken=%0A`)).status).toBe(400);
  expect((await fetch(`${url}/stores`, { method: 'POST' })).status).toBe(404); expect(provider.listStores).not.toHaveBeenCalled();
});
it('never echoes unexpected provider exception details', async () => {
  provider.listStores.mockRejectedValue(new Error('private-key'));
  const response = await fetch(`${url}/stores?connectionId=work`); expect(response.status).toBe(502); expect(await response.text()).not.toContain('private-key');
});
it('requires human confirmation before delegating a binding mutation', async () => {
  const input = { vaultId: 'v', connectionId: 'work', storeName: 'fileSearchStores/a', previousStoreName: null };
  const put = (confirmed: boolean) => fetch(`${url}/bundles/b/binding`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed, expectedVersion: '2026-09-14T00:00:00Z', operationId: 'op', input }) });
  expect((await put(false)).status).toBe(400); expect(bindings.save).not.toHaveBeenCalled();
  expect((await put(true)).status).toBe(200); expect(bindings.save).toHaveBeenCalledWith('b', '2026-09-14T00:00:00Z', 'op', input, expect.any(AbortSignal));
  expect((await fetch(`${url}/bundles/b/binding`)).status).toBe(200); expect(bindings.read).toHaveBeenCalledWith('b');
});
