import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createFileSearchRoutes } from './fileSearchRoutes';
const provider = { status: vi.fn(), listStores: vi.fn() };
let server: ReturnType<typeof createServer>, url: string;
beforeEach(async () => {
  vi.clearAllMocks(); provider.status.mockReturnValue({ provider: 'gemini-file-search', enabled: true, connectionId: 'work', mode: 'read-only' });
  provider.listStores.mockResolvedValue({ connectionId: 'work', checkedAt: '2026-09-14T00:00:00Z', stores: [], nextPageToken: null });
  const app = express(); app.use(createFileSearchRoutes(provider)); server = createServer(app);
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
