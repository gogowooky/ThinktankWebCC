import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createConversationRoutes } from './conversationRoutes';
import { DisabledAIProvider, type AIProvider } from '../services/AIProvider';
import { ConversationService } from '../services/ConversationService';
import type { ConversationContext, ConversationTurn } from '../services/conversationRecord';
import type { BigQueryService } from '../services/BigQueryService';

const source: ConversationContext = { schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId: 'bundle', capturedAt: '2026-09-14T00:00:00Z', scope: 'bundle-only', quality: 'complete',
  sources: [{ thinkId: 'source', title: '資料', content: '本文', contentHash: createHash('sha256').update('本文').digest('hex') }], issues: [], manualState: null };
const p: AIProvider = { name: 'test', model: 'test-model', generate: vi.fn(async () => ({ reply: '回答', insufficientEvidence: false, citations: [{ thinkId: 'source', quote: '本文' }], proposals: [] })) };
const store = { getRecord: vi.fn(), saveThinkSupport: vi.fn(), saveChatConversation: vi.fn() };
let server: ReturnType<typeof createServer>, url: string, turn: ConversationTurn;
const record = { file_id: 'bundle', category: 'bundle', updated_at: '2026-09-14T00:00:00Z', metadata: JSON.stringify({ keep: 1, thoughtSupport: { goal: '旧目的' }, thinkSupport: { keep: true } }) };
beforeEach(async () => {
  vi.clearAllMocks(); store.getRecord.mockResolvedValue({ success: true, data: record }); store.saveThinkSupport.mockResolvedValue({ success: true, data: true }); store.saveChatConversation.mockResolvedValue({ success: true, data: true });
  turn = await new ConversationService(p).answer('turn', '質問', source, [], new AbortController().signal); vi.mocked(p.generate).mockClear();
  const app = express(); app.use(express.json()); app.use('/active', createConversationRoutes(p, store as unknown as BigQueryService)); app.use('/disabled', createConversationRoutes(new DisabledAIProvider(), store as unknown as BigQueryService));
  server = createServer(app); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
function generate(changes = {}, prefix = 'active') { return fetch(`${url}/${prefix}/turns`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'turn', question: '質問', context: source, confirmed: true, historyIds: [], ...changes }) }); }
function save(value = turn) { return fetch(`${url}/active/bundles/bundle/turns/turn`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); }
function chatRecords() {
  const chat = { ...record, file_id: 'chat', category: 'chat', title: '# TODO:Overview｜[進行中]別の題名', content: '既存本文', metadata: JSON.stringify({ keep: 1 }) };
  const bundle = { ...record, title: '# 課題' };
  store.getRecord.mockImplementation(async value => ({ success: true, data: value === 'chat' ? chat : bundle }));
}
function saveChat(value = turn) { return fetch(`${url}/active/chats/chat/bundles/bundle/turns/turn`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); }
it('disabled requests never read storage or execute AI, while saved histories remain readable', async () => {
  expect((await generate({}, 'disabled')).status).toBe(503); expect(store.getRecord).not.toHaveBeenCalled(); expect(p.generate).not.toHaveBeenCalled();
  expect((await fetch(`${url}/disabled/bundles/bundle`)).status).toBe(200);
});
it('generates without changing records, then appends while preserving all unrelated metadata', async () => {
  expect((await generate()).status).toBe(200); expect(store.saveThinkSupport).not.toHaveBeenCalled();
  expect((await save()).status).toBe(200);
  expect(store.saveThinkSupport.mock.calls[0][2]).toMatchObject({ keep: 1, thoughtSupport: { goal: '旧目的' }, thinkSupport: { keep: true }, thinkConversations: { turns: [turn] } });
});
it('reads and saves AIChat history in the selected Chat record regardless of its title', async () => {
  chatRecords();
  expect((await generate({ chatId: 'chat' })).status).toBe(200);
  expect((await saveChat()).status).toBe(200);
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
  expect(store.saveChatConversation.mock.calls[0][0]).toBe('chat');
  expect(store.saveChatConversation.mock.calls[0][2]).toMatchObject({ keep: 1, thinkConversations: { turns: [turn] } });
  expect(store.saveChatConversation.mock.calls[0][3]).toContain('既存本文');
  expect(store.saveChatConversation.mock.calls[0][3]).toContain('## 質問');
  expect(store.saveChatConversation.mock.calls[0][3]).toContain('回答');
});
it('generates and saves a Thinktank Chat-only turn without a Bundle record', async () => {
  const chat = { ...record, file_id: 'chat', category: 'chat', title: '# TODO:Thinktank｜相談', metadata: JSON.stringify({ keep: 1 }) };
  store.getRecord.mockResolvedValue({ success: true, data: chat });
  vi.mocked(p.generate).mockResolvedValueOnce({ reply: '一般回答', insufficientEvidence: true, citations: [], proposals: [] });
  const chatContext: ConversationContext = { ...source, snapshotId: 'chat', bundleId: 'chat', scope: 'chat-only', sources: [], manualState: null };
  const response = await generate({ chatId: 'chat', context: chatContext });
  expect(response.status).toBe(200);
  const chatTurn = await response.json() as ConversationTurn;
  const saved = await fetch(`${url}/active/chats/chat/turns/${chatTurn.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chatTurn) });
  expect(saved.status).toBe(200);
  expect(store.getRecord).toHaveBeenCalledWith('chat');
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
  expect(store.saveChatConversation.mock.calls[0][0]).toBe('chat');
});
it('recovers text-only Chat history for display and continuation', async () => {
  const chat = { ...record, file_id: 'chat', category: 'chat', content: '# 相談\n## 前の質問\n以前の回答', metadata: JSON.stringify({ keep: 1 }) };
  store.getRecord.mockResolvedValue({ success: true, data: chat });
  const response = await fetch(`${url}/active/chats/chat?vaultId=vault`);
  expect(response.status).toBe(200);
  const log = await response.json() as { turns: ConversationTurn[] };
  expect(log.turns).toHaveLength(1);
  expect(log.turns[0]).toMatchObject({ question: '前の質問', provider: 'legacy-text', answer: { reply: '以前の回答' } });
  expect(store.saveChatConversation.mock.calls[0][2]).toMatchObject({ thinkConversations: { turns: [expect.objectContaining({ provider: 'legacy-text' })] } });
});
it('retries saving idempotently without regenerating an answer', async () => {
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, metadata: JSON.stringify({ thinkConversations: { schemaVersion: 1, turns: [turn] } }) } });
  expect((await save()).status).toBe(200); expect(store.saveThinkSupport).not.toHaveBeenCalled();
  expect((await generate()).status).toBe(200); expect(p.generate).not.toHaveBeenCalled();
  expect((await save({ ...turn, question: '別の質問' })).status).toBe(409);
});
it('does not expand sent history after another editor adds a turn', async () => {
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, metadata: JSON.stringify({ thinkConversations: { schemaVersion: 1, turns: [{ ...turn, id: 'other' }] } }) } });
  expect((await generate()).status).toBe(409); expect(p.generate).not.toHaveBeenCalled();
});
it('retains optimistic locking on metadata append', async () => {
  store.saveThinkSupport.mockResolvedValue({ success: true, data: false });
  expect((await save()).status).toBe(409); expect(p.generate).not.toHaveBeenCalled();
});
it('recognizes an already saved turn when a JSON column reorders its object keys', async () => {
  const reordered = Object.fromEntries(Object.entries(turn).reverse());
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, metadata: JSON.stringify({ thinkConversations: { schemaVersion: 1, turns: [reordered] } }) } });
  expect((await save()).status).toBe(200); expect(store.saveThinkSupport).not.toHaveBeenCalled();
});
it('refuses missing confirmation or a different save destination', async () => {
  expect((await generate({ confirmed: false })).status).toBe(400);
  expect((await save({ ...turn, context: { ...source, bundleId: 'other' } })).status).toBe(400);
  expect(store.saveThinkSupport).not.toHaveBeenCalled(); expect(p.generate).not.toHaveBeenCalled();
});
it('does not overwrite unknown history versions or deleted bundles', async () => {
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, metadata: JSON.stringify({ thinkConversations: { schemaVersion: 2, turns: [] } }) } });
  expect((await save()).status).toBe(422); expect(store.saveThinkSupport).not.toHaveBeenCalled();
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, is_deleted: true } });
  expect((await generate()).status).toBe(404); expect(p.generate).not.toHaveBeenCalled();
});
