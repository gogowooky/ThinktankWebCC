// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ render: vi.fn() }));
const history = vi.hoisted(() => vi.fn());
vi.mock('../../services/ConversationService', () => ({ ConversationClient: class { history = history; } }));
vi.mock('./BundleConversation', () => ({ BundleConversation: (props: { bundleId: string; chatId: string; draftScope: string; inputHeader?: ReactNode }) => { calls.render(props); return <div className="bundle-conversation"><textarea aria-label="今回の質問" data-bundle={props.bundleId} data-chat={props.chatId} /><div className="bundle-conversation-input">{props.inputHeader}</div></div>; } }));
import { SupportChat } from './SupportChat';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host);
  history.mockResolvedValue([]);
  vault = new TTVault('vault'); vault.IsLoaded = true;
  for (const id of ['a', 'b']) {
    const bundle = new TTThink(); bundle.ID = id; bundle.ContentType = 'bundle'; bundle.Name = `Bundle ${id}`; vault.AddThink(bundle);
    const chat = new TTThink(); chat.ID = `chat-${id}`; chat.ContentType = 'chat'; chat.Name = `TODO:Thinktank｜[進行中]Bundle ${id}`; chat.Content = `${chat.Name}\n`; vault.AddThink(chat);
  }
});
it('previews the latest purpose and completion criteria before creating the task', async () => {
  const seed = { goal: '誕生日を祝う', completionCriteria: '参加者とお祝いを終える' };
  history.mockResolvedValue([{ context: { vaultId: vault.ID, scope: 'chat-only', bundleId: 'chat-a' }, answer: { proposals: [
    { field: 'goal', after: seed.goal }, { field: 'completionCriteria', after: seed.completionCriteria },
  ] } }]);
  const create = vi.fn().mockResolvedValue(undefined);
  await show('', 'chat-a', create);
  await act(async () => host.querySelector<HTMLButtonElement>('.support-task-start > button')!.click());
  expect(host.textContent).toContain(seed.goal);
  expect(host.textContent).toContain(seed.completionCriteria);
  expect(create).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>('.support-task-start__actions button')!.click());
  expect(create).toHaveBeenCalledWith('chat-a', 'Bundle a', seed);
});

it('requires review again if the conversation changes and clears review when switching Chat', async () => {
  const create = vi.fn();
  await show('', 'chat-a', create);
  await act(async () => host.querySelector<HTMLButtonElement>('.support-task-start > button')!.click());
  history.mockResolvedValue([{ context: { vaultId: vault.ID, scope: 'chat-only', bundleId: 'chat-a' }, answer: { proposals: [
    { field: 'goal', after: '新しい目的' }, { field: 'completionCriteria', after: '新しい条件' },
  ] } }]);
  await act(async () => host.querySelector<HTMLButtonElement>('.support-task-start__actions button')!.click());
  expect(create).not.toHaveBeenCalled();
  expect(host.textContent).toContain('もう一度確認');
  await show('', 'chat-b', create);
  expect(host.querySelector('input[aria-label="課題名"]')).toBeNull();
  expect(host.textContent).not.toContain('新しい目的');
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(bundleId = 'a', selectedId = 'chat-a', onStartTask?: (chatId: string, title: string) => Promise<void>) {
  await act(async () => root.render(<SupportChat vault={vault} selectedId={selectedId} bundleId={bundleId} panelName="Thinktank"
    onStartTask={onStartTask}
    onSelected={vi.fn()} onMessages={vi.fn()} onWaiting={vi.fn()} modelSelector={{ value: { provider: 'openai', model: 'unused' }, onChange: vi.fn() }} />));
}
it('uses the Chat selected in the upper list and has no second selector or conversation-history panel', async () => {
  // Chat名は上のリストの選択行に出ているので、会話欄では繰り返さない。
  await show(); expect(host.textContent).not.toContain('TODO:Thinktank｜[進行中]Bundle a'); expect(host.querySelector('select')).toBeNull();
  expect(host.textContent).not.toContain('これまでの会話'); expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBeNull();
  expect(host.querySelector('textarea')?.getAttribute('data-chat')).toBe('chat-a');
  expect(calls.render.mock.calls.at(-1)?.[0].draftScope).toBe('aichat:Thinktank:panel');
});
it('follows the upper Chat selection and allows Thinktank without an Overview Bundle', async () => {
  await show('a'); await show('b', 'chat-b'); expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBeNull();
  await show('', 'chat-a'); expect(host.querySelector('textarea')?.getAttribute('data-chat')).toBe('chat-a');
  await show('missing', 'missing'); expect(host.querySelector('textarea')).toBeNull(); expect(host.textContent).toContain('相談するChat');
  await show('', ''); expect(host.querySelector('textarea')).toBeNull();
});
it('accepts a selected Chat whose title differs from the Bundle and preserves its existing content', async () => {
  const chat = new TTThink(); chat.ID = 'chat'; chat.ContentType = 'chat'; chat.Name = 'TODO:Thinktank｜[進行中]別件'; chat.Content = '保存済み会話\n## 質問\n回答'; vault.AddThink(chat); const before = chat.Content;
  await show('a', chat.ID); expect(host.querySelector('textarea')?.getAttribute('data-chat')).toBe(chat.ID);
  expect(host.textContent).not.toContain('同名のBundleが必要'); expect(chat.Content).toBe(before);
});
it('starts a task from the selected Thinktank Chat after the user confirms its title', async () => {
  const onStartTask = vi.fn().mockResolvedValue(undefined);
  await show('', 'chat-a', onStartTask);
  await act(async () => { host.querySelector<HTMLButtonElement>('.support-task-start > button')!.click(); });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="課題名"]')!;
  expect(input.value).toBe('Bundle a');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '誕生日会を開催する');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { host.querySelector<HTMLButtonElement>('.support-task-start__actions button')!.click(); });
  expect(onStartTask).toHaveBeenCalledWith('chat-a', '誕生日会を開催する');
  expect(host.textContent).toContain('Overviewで課題を開きました');
});
it('hands the task-start control to the conversation input band instead of the scrolling history', async () => {
  await show('', 'chat-a', vi.fn());
  expect(host.querySelector('.support-task-start')!.closest('.bundle-conversation-input')).not.toBeNull();
  expect(calls.render.mock.calls.at(-1)?.[0].inputHeader).toBeTruthy();
});
it('uses the Chat-owned Bundle independently of the Overview selection', async () => {
  vault.GetThink('chat-a')!.Metadata.taskContext = { schemaVersion: 1, bundleId: 'a' };
  await show('b', 'chat-a');
  expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBe('a');
  await show('', 'chat-a');
  expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBe('a');
  await show('a', 'chat-b');
  expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBeNull();
});
it('blocks conversation when the associated task is missing', async () => {
  vault.GetThink('chat-a')!.Metadata.taskContext = { schemaVersion: 1, bundleId: 'missing' };
  await show('b', 'chat-a');
  expect(host.querySelector('textarea')).toBeNull();
  expect(host.textContent).toContain('対応する課題を読み込めません');
});
it('shows creation failures next to the task controls and retains the entered title', async () => {
  await show('', 'chat-a', vi.fn().mockRejectedValue(new Error('保存に失敗しました')));
  await act(async () => { host.querySelector<HTMLButtonElement>('.support-task-start > button')!.click(); });
  await act(async () => { host.querySelector<HTMLButtonElement>('.support-task-start__actions button')!.click(); });
  expect(host.querySelector('.support-task-start [role="status"]')!.textContent).toBe('保存に失敗しました');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="課題名"]')!.value).toBe('Bundle a');
});
