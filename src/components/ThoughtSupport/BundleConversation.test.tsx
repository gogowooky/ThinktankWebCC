// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
const api = vi.hoisted(() => ({ status: vi.fn(), history: vi.fn(), generate: vi.fn(), save: vi.fn(), context: vi.fn() }));
vi.mock('../../services/ConversationService', () => ({
  ConversationClient: class { status = api.status; history = api.history; generate = api.generate; save = api.save; },
  conversationContext: (value: unknown) => value,
  chatOnlyConversationContext: (vaultId: string, chatId: string) => ({ ...context(chatId), vaultId, bundleId: chatId, snapshotId: chatId, scope: 'chat-only', sources: [], manualState: null }),
}));
vi.mock('../../services/ContextService', () => ({ ContextService: class { getBundleContext = api.context; } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { BundleConversation } from './BundleConversation';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import type { ConversationContext, ConversationTurn } from '../../services/ConversationService';
const context = (bundleId = 'a'): ConversationContext => ({ schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId, capturedAt: '2026-09-14T00:00:00Z', scope: 'bundle-only', quality: 'complete', sources: [], manualState: null, issues: [] });
const turn = (): ConversationTurn => ({ schemaVersion: 1, id: 'turn', createdAt: '2026-09-14T00:00:00Z', question: '質問', context: context(), answer: { reply: '回答', insufficientEvidence: true, citations: [], proposals: [] }, provider: 'test', model: 'model' });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  api.status.mockResolvedValue({ enabled: true, provider: 'test', model: 'model' }); api.history.mockResolvedValue([]);
  api.context.mockImplementation(async id => context(id)); api.generate.mockResolvedValue(turn()); api.save.mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(id: string | undefined = 'a', chatId?: string) { await act(async () => root.render(<BundleConversation vault={vault} bundleId={id} chatId={chatId} onOpen={vi.fn()} />)); }
async function showStrict(id: string | undefined = 'a', chatId?: string) { await act(async () => root.render(<StrictMode><BundleConversation vault={vault} bundleId={id} chatId={chatId} onOpen={vi.fn()} /></StrictMode>)); }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function input(value: string) { await act(async () => { const area = host.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value); area.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function prepare() { await input('質問'); }

it('prepares automatically and cannot generate when disabled', async () => {
  api.status.mockResolvedValue({ enabled: false, provider: 'none', model: '' }); await show();
  expect(api.status).toHaveBeenCalled(); expect(api.context).toHaveBeenCalled(); await input('質問');
  expect(button('送信').disabled).toBe(true); expect(api.generate).not.toHaveBeenCalled(); expect(host.textContent).toContain('停止中');
});
it('finishes preparation after the development StrictMode remount', async () => {
  await showStrict('', 'chat-a');
  await input('続きを話す');
  expect(api.status).toHaveBeenCalledTimes(2);
  expect(button('送信').disabled).toBe(false);
});
it('allows a Chat-only conversation without loading Bundle context', async () => {
  await show('', 'chat-a');
  expect(api.context).not.toHaveBeenCalled();
  expect(api.history).toHaveBeenCalledWith('', expect.any(AbortSignal), 'chat-a');
  expect(host.textContent).toContain('参照資料なし');
});
it('shows cached Chat metadata while the server refresh is still pending', async () => {
  const chat = new TTThink(); chat.ID = 'chat-a'; chat.ContentType = 'chat'; chat.Content = '# Chat';
  chat.Metadata = { thinkConversations: { schemaVersion: 1, turns: [turn()] } }; vault.AddThink(chat);
  api.status.mockImplementation(() => new Promise(() => {}));
  api.history.mockImplementation(() => new Promise(() => {}));
  await show('', 'chat-a');
  expect(host.textContent).toContain('回答');
});
it('keeps drafts separate between Overview and AIChat for the same Bundle', async () => {
  await show(); await input('Overviewの質問');
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" draftScope="aichat:Thinktank:panel" onOpen={vi.fn()} />));
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe(''); await input('AIChatの質問');
  await show(); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Overviewの質問');
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" draftScope="aichat:Thinktank:panel" onOpen={vi.fn()} />));
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('AIChatの質問'); expect(api.generate).not.toHaveBeenCalled();
});
it('prepares a progress review without sending or overwriting an existing question', async () => {
  await show(); await click('進行を見直す質問を入力');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toContain('本人の完了状態は確定しない');
  expect(api.generate).not.toHaveBeenCalled(); expect(button('進行を見直す質問を入力').disabled).toBe(true);
  expect(button('送信').disabled).toBe(false);
});
it('treats the Send button as confirmation and persists without adopting proposals', async () => {
  await show('a', 'chat-a'); await input('質問');
  expect(button('送信').disabled).toBe(false);
  expect(host.textContent).not.toContain('このメッセージをAIに送信する');
  await click('送信');
  expect(api.save).toHaveBeenCalledWith(turn(), 'chat-a', 'a');
  expect(button('送信').disabled).toBe(true);
});
it('keeps audit and export controls outside the conversation flow', async () => {
  api.history.mockResolvedValue([turn()]);
  await show('a', 'chat-a');
  const exportButton = button('この会話をJSONで書き出す');
  expect(exportButton.closest('.bundle-conversation-options')).not.toBeNull();
  expect(exportButton.closest('article')).toBeNull();
});
it('continues with a second question using refreshed sources and the saved history', async () => {
  const first = turn();
  const refreshed = { ...context(), snapshotId: 'new-snapshot' };
  api.history.mockResolvedValueOnce([]).mockResolvedValue([first]);
  api.context.mockResolvedValueOnce(context()).mockResolvedValue(refreshed);
  await show('a', 'chat-a'); await prepare(); await click('送信');
  expect(host.textContent).toContain('回答');
  await input('次の質問');
  api.generate.mockResolvedValueOnce({ ...first, id: 'second', question: '次の質問', context: refreshed });
  await click('送信');
  expect(api.generate.mock.calls[1]).toEqual([refreshed, '次の質問', ['turn'], expect.any(AbortSignal), 'chat-a']);
  expect(api.save).toHaveBeenCalledTimes(2);
});
it('retries preparation after a connection failure without losing the draft or calling AI', async () => {
  api.history.mockRejectedValueOnce(new Error('接続できません'));
  await show('a', 'chat-a'); await input('誕生日会を開きたい');
  expect(button('送信').disabled).toBe(true);
  await click('再試行');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('誕生日会を開きたい');
  expect(button('送信').disabled).toBe(false);
  expect(api.generate).not.toHaveBeenCalled();
});
it('keeps a failed save across Bundle switches and retries saving without repeating AI', async () => {
  api.save.mockRejectedValueOnce(new Error('保存競合')); await show(); await prepare(); await click('送信');
  expect(host.textContent).toContain('保存できません'); await show('b'); expect(host.textContent).not.toContain('保存を再試行');
  await show('a'); expect(host.textContent).toContain('保存を再試行'); await click('保存を再試行');
  expect(api.generate).toHaveBeenCalledTimes(1); expect(api.save).toHaveBeenCalledTimes(2);
});
it('aborts a late answer on Bundle switch and never saves it under either Bundle', async () => {
  let resolve!: (value: ConversationTurn) => void;
  api.generate.mockImplementation(() => new Promise(r => { resolve = r; })); await show(); await prepare(); await click('送信');
  const signal = api.generate.mock.calls[0][3] as AbortSignal;
  await show('b'); expect(signal.aborted).toBe(true); await act(async () => resolve(turn()));
  expect(api.save).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('保存済み');
  await show('a'); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('質問');
});
it('reads history even if the current Bundle context cannot be resolved', async () => {
  api.context.mockRejectedValue(new Error('資料が取得できません')); api.history.mockResolvedValue([turn()]);
  await show();
  expect(host.textContent).toContain('回答'); expect(host.textContent).toContain('資料が取得できません');
  expect(button('送信').disabled).toBe(true);
});
it('cancels generation without losing the question', async () => {
  let reject!: (error: Error) => void;
  api.generate.mockImplementation(() => new Promise((_resolve, r) => { reject = r; }));
  await show(); await prepare(); await click('送信'); await click('中断');
  await act(async () => reject(new Error('aborted')));
  expect(host.textContent).toContain('応答を中断しました'); expect(api.save).not.toHaveBeenCalled();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('質問');
});
