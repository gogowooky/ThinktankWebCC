// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('./BundleConversation', () => ({ BundleConversation: (props: { bundleId: string; chatId: string; draftScope: string }) => { calls.render(props); return <textarea aria-label="今回の質問" data-bundle={props.bundleId} data-chat={props.chatId} />; } }));
import { SupportChat } from './SupportChat';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host);
  vault = new TTVault('vault'); vault.IsLoaded = true;
  for (const id of ['a', 'b']) {
    const bundle = new TTThink(); bundle.ID = id; bundle.ContentType = 'bundle'; bundle.Name = `Bundle ${id}`; vault.AddThink(bundle);
    const chat = new TTThink(); chat.ID = `chat-${id}`; chat.ContentType = 'chat'; chat.Name = `TODO:Thinktank｜[進行中]Bundle ${id}`; chat.Content = `${chat.Name}\n`; vault.AddThink(chat);
  }
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(bundleId = 'a', selectedId = 'chat-a', onStartTask?: (chatId: string, title: string) => Promise<void>) {
  await act(async () => root.render(<SupportChat vault={vault} selectedId={selectedId} bundleId={bundleId} panelName="Thinktank"
    onStartTask={onStartTask}
    onSelected={vi.fn()} onMessages={vi.fn()} onWaiting={vi.fn()} modelSelector={{ value: { provider: 'openai', model: 'unused' }, onChange: vi.fn() }} />));
}
it('uses the Chat selected in the upper list and has no second selector or conversation-history panel', async () => {
  await show(); expect(host.textContent).toContain('TODO:Thinktank｜[進行中]Bundle a'); expect(host.querySelector('select')).toBeNull();
  expect(host.textContent).not.toContain('これまでの会話'); expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBe('a');
  expect(host.querySelector('textarea')?.getAttribute('data-chat')).toBe('chat-a');
  expect(calls.render.mock.calls.at(-1)?.[0].draftScope).toBe('aichat:Thinktank:panel');
});
it('follows the upper Chat selection and allows Thinktank without an Overview Bundle', async () => {
  await show('a'); await show('b', 'chat-b'); expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBe('b');
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
