import { expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import { createChatRoutes } from './chatRoutes';

vi.mock('../services/ChatService.js', () => { throw new Error('Legacy runtime must not be imported'); });

it('denies direct AI requests even with configured keys', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'test-only');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubEnv('GEMINI_API_KEY', 'test-only');
  const app = express(); app.use(express.json()); app.use('/api/chat', createChatRoutes());
  const server = createServer(app);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api/chat`;
    expect(await (await fetch(`${base}/providers`)).json()).toEqual({ anthropic: false, openai: false, gemini: false });
    const response = await fetch(`${base}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'private' }] }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'AI_DISABLED' });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    vi.unstubAllEnvs();
  }
});
