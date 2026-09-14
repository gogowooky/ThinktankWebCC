// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
const api = vi.hoisted(() => ({ status: vi.fn(), history: vi.fn(), generate: vi.fn(), save: vi.fn(), context: vi.fn() }));
vi.mock('../../services/ConversationService', () => ({
  ConversationClient: class { status = api.status; history = api.history; generate = api.generate; save = api.save; },
  conversationContext: (value: unknown) => value,
}));
vi.mock('../../services/ContextService', () => ({ ContextService: class { getBundleContext = api.context; } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { BundleConversation } from './BundleConversation';
import { TTVault } from '../../models/TTVault';
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
async function show(id = 'a') { await act(async () => root.render(<BundleConversation vault={vault} bundleId={id} onOpen={vi.fn()} />)); }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function input(value: string) { await act(async () => { const area = host.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value); area.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function prepare() { await click('資料・履歴・接続状態を確認'); await input('質問'); await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click()); }

it('makes no request on display and cannot generate when disabled', async () => {
  api.status.mockResolvedValue({ enabled: false, provider: 'none', model: '' }); await show();
  expect(api.status).not.toHaveBeenCalled(); expect(api.context).not.toHaveBeenCalled();
  await click('資料・履歴・接続状態を確認'); await input('質問');
  expect(button('質問を送信').disabled).toBe(true); expect(api.generate).not.toHaveBeenCalled(); expect(host.textContent).toContain('停止中');
});
it('requires confirmation and persists the answer without adopting its proposals', async () => {
  await show(); await click('資料・履歴・接続状態を確認'); await input('質問');
  expect(button('質問を送信').disabled).toBe(true);
  await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click());
  await click('質問を送信');
  expect(api.save).toHaveBeenCalledWith(turn()); expect(host.textContent).toContain('会話を保存しました');
  expect(button('質問を送信').disabled).toBe(true);
});
it('keeps a failed save across Bundle switches and retries saving without repeating AI', async () => {
  api.save.mockRejectedValueOnce(new Error('保存競合')); await show(); await prepare(); await click('質問を送信');
  expect(host.textContent).toContain('未保存'); await show('b'); expect(host.textContent).not.toContain('保存だけ再試行');
  await show('a'); expect(host.textContent).toContain('保存だけ再試行'); await click('保存だけ再試行');
  expect(api.generate).toHaveBeenCalledTimes(1); expect(api.save).toHaveBeenCalledTimes(2);
});
it('aborts a late answer on Bundle switch and never saves it under either Bundle', async () => {
  let resolve!: (value: ConversationTurn) => void;
  api.generate.mockImplementation(() => new Promise(r => { resolve = r; })); await show(); await prepare(); await click('質問を送信');
  const signal = api.generate.mock.calls[0][3] as AbortSignal;
  await show('b'); expect(signal.aborted).toBe(true); await act(async () => resolve(turn()));
  expect(api.save).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('保存済み');
  await show('a'); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('質問');
});
it('reads history even if the current Bundle context cannot be resolved', async () => {
  api.context.mockRejectedValue(new Error('資料が取得できません')); api.history.mockResolvedValue([turn()]);
  await show(); await click('資料・履歴・接続状態を確認');
  expect(host.textContent).toContain('回答'); expect(host.textContent).toContain('資料が取得できません');
  expect(button('質問を送信').disabled).toBe(true);
});
it('cancels generation without losing the question', async () => {
  let reject!: (error: Error) => void;
  api.generate.mockImplementation(() => new Promise((_resolve, r) => { reject = r; }));
  await show(); await prepare(); await click('質問を送信'); await click('応答を中断');
  await act(async () => reject(new Error('aborted')));
  expect(host.textContent).toContain('応答を中断しました'); expect(api.save).not.toHaveBeenCalled();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('質問');
});
