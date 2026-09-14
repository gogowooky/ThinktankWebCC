import express from 'express';
import { createServer } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentRoutes } from './agentRoutes';
import type { AgentService } from '../services/AgentService';
const service = { status: vi.fn(() => ({ enabled: false })), read: vi.fn(), create: vi.fn(), run: vi.fn(), cancel: vi.fn(), apply: vi.fn(), readArtifact: vi.fn() };
let server: ReturnType<typeof createServer>, url: string;
beforeEach(async () => {
  vi.clearAllMocks(); service.run.mockResolvedValue({ status: 'succeeded' }); service.cancel.mockResolvedValue({ status: 'cancelled' });
  const app = express(); app.use(express.json()); app.use(createAgentRoutes(service as unknown as AgentService));
  server = createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
function post(path: string, body: unknown) { return fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
it('requires explicit confirmation for registration, execution, and application', async () => {
  expect((await post('/jobs', { confirmed: false })).status).toBe(400);
  expect((await post('/bundles/bundle/jobs/job/run', {})).status).toBe(400);
  expect((await post('/bundles/bundle/jobs/job/apply', { confirmed: false })).status).toBe(400);
  expect(service.create).not.toHaveBeenCalled(); expect(service.run).not.toHaveBeenCalled(); expect(service.apply).not.toHaveBeenCalled();
});
it('keeps cancellation separate from execution and passes explicit retry intent', async () => {
  expect((await post('/bundles/bundle/jobs/job/cancel', { confirmed: true })).status).toBe(200);
  expect(service.cancel).toHaveBeenCalledWith('bundle', 'job'); expect(service.run).not.toHaveBeenCalled();
  expect((await post('/bundles/bundle/jobs/job/run', { confirmed: true, retry: true })).status).toBe(200);
  expect(service.run).toHaveBeenCalledWith('bundle', 'job', true, expect.any(AbortSignal));
});
