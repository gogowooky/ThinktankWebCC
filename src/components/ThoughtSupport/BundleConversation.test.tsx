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
import { TTModels } from '../../models/TTModels';
import { TTApplication } from '../../views/TTApplication';
import type { ConversationContext, ConversationTurn } from '../../services/ConversationService';
import { resetDraftStores } from '../../services/draftStore';
const context = (bundleId = 'a'): ConversationContext => ({ schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId, capturedAt: '2026-09-14T00:00:00Z', scope: 'bundle-only', quality: 'complete', sources: [], manualState: null, issues: [] });
const turn = (): ConversationTurn => ({ schemaVersion: 1, id: 'turn', createdAt: '2026-09-14T00:00:00Z', question: '質問', context: context(), answer: { reply: '回答', insufficientEvidence: true, citations: [], proposals: [] }, provider: 'test', model: 'model' });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  resetDraftStores();
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  api.status.mockResolvedValue({ enabled: true, provider: 'test', model: 'model' }); api.history.mockResolvedValue([]);
  api.context.mockImplementation(async id => context(id)); api.generate.mockResolvedValue(turn()); api.save.mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); TTApplication.resetInstance(); resetDraftStores(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('has no AI picker or prepared-question actions below the message field', async () => {
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" chatId="chat-a" onOpen={vi.fn()}
    modelSelector={{ value: { provider: 'openai', model: 'gpt-5.6' }, onChange: vi.fn() }} />));
  expect(host.querySelector('details')).toBeNull();
  expect(host.querySelector('input[type="radio"]')).toBeNull();
  expect(host.textContent).not.toContain('質問を入力');
  expect(api.context).toHaveBeenCalledWith('a', expect.anything());
});
it('does not expose information promotion controls in Chat', async () => {
  const bundle = new TTThink(); bundle.ID = 'a'; bundle.Metadata = { operations: {} }; vault.AddThink(bundle);
  api.history.mockResolvedValue([turn()]);
  await show('a', 'chat-a');
  expect(host.querySelector('.promotion-review')).toBeNull();
  expect(host.textContent).not.toContain('情報の昇格');
  expect(host.textContent).not.toContain('昇格候補');
});
it('captures Bundle sources after saved Chat synchronization completes', async () => {
  let resolve!: (turns: ConversationTurn[]) => void;
  api.history.mockImplementationOnce(() => new Promise<ConversationTurn[]>(r => { resolve = r; }));
  await show('a', 'chat-a');
  expect(api.context).not.toHaveBeenCalled();
  await act(async () => resolve([]));
  expect(api.context).toHaveBeenCalledWith('a', expect.anything());
});
it('does not request context or register a warning from history completed after reset', async () => {
  let resolve!: (turns: ConversationTurn[]) => void;
  api.history.mockImplementationOnce(() => new Promise<ConversationTurn[]>(r => { resolve = r; }));
  await show('a', 'chat-a'); resetDraftStores();
  const add = vi.spyOn(window, 'addEventListener');
  await act(async () => resolve([]));
  expect(api.context).not.toHaveBeenCalled();
  expect(add.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(0);
});
async function show(id: string | undefined = 'a', chatId?: string) { await act(async () => root.render(<BundleConversation vault={vault} bundleId={id} chatId={chatId} onOpen={vi.fn()} />)); }
async function showStrict(id: string | undefined = 'a', chatId?: string) { await act(async () => root.render(<StrictMode><BundleConversation vault={vault} bundleId={id} chatId={chatId} onOpen={vi.fn()} /></StrictMode>)); }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function input(value: string) { await act(async () => { const area = host.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value); area.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function prepare() { await input('質問'); }

it('preserves a different Vault question and unload warning when the old app is disposed', async () => {
  TTApplication.resetInstance();
  const model = vi.spyOn(TTModels, 'Instance', 'get').mockReturnValue({ Vault: vault } as TTModels);
  const oldApp = TTApplication.Instance; void oldApp.Models;
  vault = new TTVault(vault.ID); model.mockReturnValue({ Vault: vault } as TTModels);
  await show(); await input('新しいVaultの未保存質問');
  oldApp.dispose(); TTApplication.resetInstance(); oldApp.dispose();
  await show();
  expect(host.querySelector('textarea')!.value).toBe('新しいVaultの未保存質問');
  const leaving = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
});

it('keeps one unload listener through StrictMode, hidden remounts and equal-ID Vault switches', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const firstVault = vault;
  await showStrict(); await input('元のVaultの入力');
  await act(async () => root.render(null));
  const leaving = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  vault = new TTVault(firstVault.ID);
  await showStrict(); expect(host.querySelector('textarea')!.value).toBe('');
  await input('同じIDの別Vaultの入力');
  vault = firstVault;
  await showStrict(); expect(host.querySelector('textarea')!.value).toBe('元のVaultの入力');
  expect(add.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(1);
});

it('keeps an unsaved answer while hidden and discards it on explicit app-lifetime reset', async () => {
  api.save.mockRejectedValueOnce(new Error('保存できません'));
  await show(); await input('残す質問'); await click('送信');
  expect(host.textContent).toContain('回答を保存できませんでした。');
  await act(async () => root.render(null));
  const leaving = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  await show(); expect(host.textContent).toContain('回答を保存できませんでした。');
  resetDraftStores();
  await act(async () => root.render(null));
  await show(); expect(host.querySelector('textarea')!.value).toBe('');
  expect(host.textContent).not.toContain('回答を保存できませんでした。');
  const clean = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
});

it('refreshes child records when a question about a parent task is sent', async () => {
  const before: ConversationContext = { ...context(), subtasks: { scope: 'loaded-direct-children', items: [{ bundleId: 'child', title: '会場予約', status: 'unrecorded' }] } };
  api.context.mockResolvedValue(before);
  await show(); await input('次の行動を整理してください');
  const after: ConversationContext = { ...before, subtasks: { scope: 'loaded-direct-children', items: [{ bundleId: 'child', title: '会場予約', status: 'unsaved' }] } };
  api.context.mockResolvedValue(after);
  await click('送信');
  expect(api.context).toHaveBeenCalledTimes(3); // Initial preparation, before sending, after saving.
  expect(api.generate.mock.calls[0]).toContainEqual(after);
});
it('refreshes child records on normal sends and stops if refresh fails', async () => {
  api.context.mockResolvedValue({ ...context(), subtasks: { scope: 'loaded-direct-children', items: [] } });
  await show(); await input('次は何をしますか');
  api.context.mockRejectedValueOnce(new Error('子課題の状況が大きすぎます'));
  await click('送信');
  expect(api.generate).not.toHaveBeenCalled(); expect(host.querySelector('textarea')!.value).toBe('次は何をしますか');
  expect(host.textContent).toContain('子課題の状況が大きすぎます');
});
it('shows inline Think citation tags that open sources without a reference block', async () => {
  const value = turn(); value.answer.reply = '回答[:>1]。補足[:>2]。';
  value.context.sources = ['a', 'b'].map(id => ({ thinkId: id, title: `資料${id}`, content: '題名\n引用', contentHash: 'hash' }));
  value.answer.citations = ['a', 'b'].map(thinkId => ({ thinkId, quote: '引用', contentHash: 'hash', start: 3, end: 5 }));
  api.history.mockResolvedValue([value]);
  const onOpen = vi.fn();
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" onOpen={onOpen} />));
  expect(host.querySelector('[aria-label="リファレンス"]')).toBeNull();
  expect(host.textContent).not.toContain('引用は回答時点');
  expect(host.textContent).toContain('AI：回答[Think:a,2]。補足[Think:b,2]。');
  await act(async () => button('[Think:a,2]').click());
  expect(onOpen).toHaveBeenCalledWith('a');
});

async function enter(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', ...options });
  await act(async () => { host.querySelector('textarea')!.dispatchEvent(event); });
  return event;
}
it('sends with Enter but keeps Shift+Enter and IME confirmation from sending', async () => {
  await show(); await input('相談');
  expect((await enter({ shiftKey: true })).defaultPrevented).toBe(false);
  await enter({ isComposing: true }); await enter({ keyCode: 229 });
  await act(async () => host.querySelector('textarea')!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
  await enter(); expect(api.generate).not.toHaveBeenCalled();
  await act(async () => host.querySelector('textarea')!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await enter(); expect(api.generate).toHaveBeenCalledTimes(1);
});
it('shows a spinner while awaiting the AI and prevents duplicate keyboard submissions', async () => {
  api.generate.mockImplementationOnce(() => new Promise(() => {}));
  await show(); await input('相談'); await enter(); await enter();
  expect(api.generate).toHaveBeenCalledTimes(1);
  expect(host.querySelector('.bundle-conversation-status')?.textContent).toContain('回答を生成しています');
  expect(host.querySelector('.bundle-conversation-spinner')?.getAttribute('aria-hidden')).toBe('true');
});
it('does not submit with Enter during preparation', async () => {
  api.history.mockImplementationOnce(() => new Promise(() => {}));
  await show(); await input('相談'); await enter(); expect(api.generate).not.toHaveBeenCalled();
});

it('prepares automatically and cannot generate when disabled', async () => {
  api.status.mockResolvedValue({ enabled: false, provider: 'none', model: '' }); await show();
  expect(api.status).toHaveBeenCalled(); expect(api.context).toHaveBeenCalled(); await input('質問');
  expect(button('送信').disabled).toBe(true); expect(api.generate).not.toHaveBeenCalled(); expect(host.textContent).toContain('停止中');
  expect(host.querySelector('.bundle-conversation-status')!.textContent).toContain('AI対話は停止中です');
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
  expect(api.history).toHaveBeenCalledWith('', expect.any(AbortSignal), 'chat-a', 'vault', vault, expect.any(Function));
  expect(host.textContent).not.toContain('参照資料');
});

it('always loads the selected Bundle sources and sends them without an opt-in', async () => {
  await show('a', 'chat-a');
  expect(api.context).toHaveBeenCalledWith('a', expect.objectContaining({ maxSources: 300 }));
  expect(api.history).toHaveBeenLastCalledWith('a', expect.any(AbortSignal), 'chat-a', 'vault', vault, expect.any(Function));
  expect(host.textContent).not.toContain('Bundle内の資料を使う');
  await input('資料について相談する'); await click('送信');
  expect(api.generate.mock.calls[0][0]).toMatchObject({ scope: 'bundle-only', bundleId: 'a' });
  expect(api.save).toHaveBeenCalledWith(expect.anything(), 'chat-a', 'a');
});
it('shows cached Chat metadata while the server refresh is still pending', async () => {
  const chat = new TTThink(); chat.ID = 'chat-a'; chat.ContentType = 'chat'; chat.Content = '# Chat';
  chat.Metadata = { thinkConversations: { schemaVersion: 1, turns: [turn()] } }; vault.AddThink(chat);
  api.status.mockImplementation(() => new Promise(() => {}));
  api.history.mockImplementation(() => new Promise(() => {}));
  await show('', 'chat-a');
  expect(host.textContent).toContain('回答');
});
it('keeps drafts separate between Seeds and AIChat for the same Bundle', async () => {
  await show(); await input('Seedsの質問');
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" draftScope="aichat:Thinktank:panel" onOpen={vi.fn()} />));
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe(''); await input('AIChatの質問');
  await show(); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Seedsの質問');
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" draftScope="aichat:Thinktank:panel" onOpen={vi.fn()} />));
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('AIChatの質問'); expect(api.generate).not.toHaveBeenCalled();
});
it('treats the Send button as confirmation and persists without adopting proposals', async () => {
  await show('a', 'chat-a'); await input('質問');
  expect(button('送信').disabled).toBe(false);
  expect(host.textContent).not.toContain('このメッセージをAIに送信する');
  await click('送信');
  expect(api.save).toHaveBeenCalledWith(turn(), 'chat-a', 'a');
  expect(button('送信').disabled).toBe(true);
});
it('opens each turn record in a dialog from the icon under that turn, and never inline', async () => {
  api.history.mockResolvedValue([turn()]);
  await show('a', 'chat-a');
  expect(host.textContent).not.toContain('会話記録の確認');
  expect(host.textContent).not.toContain('schemaVersion');
  expect(host.textContent).not.toContain('この会話をJSONで書き出す');
  expect(host.textContent).not.toContain('自動保存');
  const open = host.querySelector<HTMLButtonElement>('article .bundle-conversation-record-open')!;
  expect(open.closest('.bundle-conversation-log')).not.toBeNull();
  await act(async () => open.click());
  const dialog = host.querySelector('.bundle-conversation-record')!;
  expect(dialog.classList.contains('col-sort-dialog')).toBe(true);
  expect(dialog.querySelector('.bundle-conversation-record__body')!.textContent).toContain('schemaVersion');
  expect(button('保存する')).toBeDefined();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="閉じる"]')!.click());
  expect(host.querySelector('.bundle-conversation-record')).toBeNull();
});
it('carries the send and newline guidance inside the empty message field only', async () => {
  await show('a', 'chat-a');
  expect(host.querySelector('textarea')!.placeholder).toBe('メッセージを入力、Enterで送信 · Shift+Enterで改行');
  expect(host.querySelector('.bundle-conversation-input-hint')).toBeNull();
  expect(host.querySelectorAll('.bundle-conversation-composer-footer small').length).toBe(0);
});
it('labels the questioner as You', async () => {
  api.history.mockResolvedValue([turn()]);
  await show('a', 'chat-a');
  const first = host.querySelector('article p')!.textContent!;
  expect(first.startsWith('You：')).toBe(true);
  expect(host.textContent).not.toContain('本人：');
});
it('keeps the composer and its controls out of the scrolling history', async () => {
  api.history.mockResolvedValue([turn()]);
  await show('a', 'chat-a');
  const log = host.querySelector('.bundle-conversation-log')!;
  expect(log.querySelector('article')).not.toBeNull();
  expect(log.querySelector('textarea')).toBeNull();
  expect(host.querySelector('textarea')!.closest('.bundle-conversation-input')).not.toBeNull();
  expect(button('送信').closest('.bundle-conversation-input')).not.toBeNull();
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
  expect(api.generate.mock.calls[1]).toEqual([refreshed, '次の質問', ['turn'], expect.any(AbortSignal), 'chat-a', undefined]);
  expect(api.save).toHaveBeenCalledTimes(2);
});
it('recovers from a connection failure through the same Send control', async () => {
  api.history.mockRejectedValueOnce(new Error('接続できません'));
  await show('a', 'chat-a'); await input('誕生日会を開きたい');
  expect(host.textContent).not.toContain('再試行');
  expect(host.querySelector('.bundle-conversation-status')!.textContent).toContain('接続できません');
  expect(button('送信').disabled).toBe(false);
  await click('送信');
  expect(api.generate).toHaveBeenCalledTimes(1);
  expect(api.generate.mock.calls[0][1]).toBe('誕生日会を開きたい');
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

it('accepts a draft during preparation, times out even if a dependency ignores abort, and ignores its late result', async () => {
  vi.useFakeTimers();
  let finish!: (value: ConversationContext) => void;
  api.context.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await show();
  expect(host.querySelector('textarea')!.disabled).toBe(false);
  await input('開催場所を相談したい');
  expect(button('送信').disabled).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(host.textContent).toContain('準備に時間がかかっています');
  expect((api.context.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
  expect(button('送信').disabled).toBe(false);
  await click('送信');
  await act(async () => finish(context('wrong')));
  // 送信で取り直した資料が使われ、中断済みの取得が後から返した資料は捨てられる
  expect(api.generate.mock.calls[0][0].bundleId).toBe('a');
  expect(api.generate.mock.calls[0][1]).toBe('開催場所を相談したい');
  expect(host.querySelector('textarea')!.value).toBe('');
});

it('can cancel preparation without losing input or generating automatically', async () => {
  api.history.mockImplementationOnce(() => new Promise(() => {}));
  await show(); await input('相談の下書き'); await click('準備を中断');
  expect(host.textContent).toContain('準備を中断しました');
  expect(host.querySelector('textarea')!.value).toBe('相談の下書き');
  expect(api.generate).not.toHaveBeenCalled();
  expect(button('送信').disabled).toBe(false);
  await click('送信');
  expect(api.generate).toHaveBeenCalledTimes(1);
});
it('sends the model chosen for the panel', async () => {
  const selection = { provider: 'gemini' as const, model: 'gemini-3.6-flash' };
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" onOpen={vi.fn()} modelSelector={{ value: selection, onChange: vi.fn() }} />));
  expect(host.querySelector('select[aria-label="AIモデル"]')).toBeNull();
  await input('質問'); await click('送信');
  expect(api.generate.mock.calls[0][5]).toEqual(selection);
});

async function showWithAi() {
  await act(async () => root.render(<BundleConversation vault={vault} bundleId="a" onOpen={vi.fn()} idleStatus={<span data-testid="ai">Claude</span>} />));
}
const statusText = () => host.querySelector('.bundle-conversation-status')?.textContent;

it('中断すると AI の応答を待たずに止め、知らせは少しで消えて AI 種別に戻る', async () => {
  api.generate.mockImplementationOnce((_c: unknown, _q: unknown, _h: unknown, signal: AbortSignal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('中断しました。', 'AbortError')));
  }));
  await showWithAi(); await input('相談'); await click('送信');
  expect(statusText()).toContain('回答を生成しています');
  vi.useFakeTimers();
  await click('中断');
  expect(statusText()).toBe('応答を中断しました。質問は保持しています。');
  expect(host.querySelector('textarea')!.value).toBe('相談');
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(statusText()).toBe('Claude');
});

it('失敗の知らせはクリックか、次の質問の入力で消え、AI 種別を選べるようになる', async () => {
  api.generate.mockRejectedValueOnce(new Error('AI CLI の実行に失敗しました'));
  await showWithAi(); await input('相談'); await click('送信');
  expect(statusText()).toBe('AI CLI の実行に失敗しました');
  expect(host.querySelector('[data-testid="ai"]')).toBeNull();
  await act(async () => { host.querySelector<HTMLElement>('.bundle-conversation-message')!.click(); });
  expect(statusText()).toBe('Claude');

  api.generate.mockRejectedValueOnce(new Error('もう一度失敗'));
  await click('送信');
  expect(statusText()).toBe('もう一度失敗');
  await input('別の質問');
  expect(statusText()).toBe('Claude');
});
