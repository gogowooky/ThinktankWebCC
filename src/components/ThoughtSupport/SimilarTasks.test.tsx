// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const history = vi.hoisted(() => vi.fn());
vi.mock('../../services/ConversationService', () => ({ ConversationClient: class { history = history; } }));
import { SimilarTasks } from './SimilarTasks';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  const chat = new TTThink(); chat.ID = 'chat'; chat.ContentType = 'chat'; chat.Content = 'ASK:Thinktank｜読書会'; vault.AddThink(chat);
  const task = new TTThink(); task.ID = 'task'; task.ContentType = 'bundle'; task.Content = '読書会の開催';
  task.Metadata.thinkSupport = { values: { goal: '読書を楽しむ', completionCriteria: '開催する' } }; vault.AddThink(task);
  history.mockResolvedValue([]);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it('runs the investigation on click and opens a result without linking or editing the Chat', async () => {
  const open = vi.fn().mockResolvedValue(undefined); const chat = vault.GetThink('chat')!;
  const before = JSON.stringify([chat.Content, chat.Metadata]);
  await act(async () => root.render(<SimilarTasks vault={vault} chatId="chat" onOpen={open} />));
  expect(history).not.toHaveBeenCalled();
  await act(async () => host.querySelector('button')!.click());
  expect(history).toHaveBeenCalledOnce(); expect(host.textContent).toContain('読書会の開催');
  expect(host.textContent).toContain('共通する語：読書会');
  await act(async () => host.querySelector('article button')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  expect(open).toHaveBeenCalledWith('task'); expect(JSON.stringify([chat.Content, chat.Metadata])).toBe(before);
});
it('ignores a late investigation after switching consultations', async () => {
  let resolve!: (turns: []) => void;
  history.mockImplementationOnce(() => new Promise<[]>(r => { resolve = r; }));
  await act(async () => root.render(<SimilarTasks key="first" vault={vault} chatId="chat" onOpen={vi.fn()} />));
  await act(async () => host.querySelector('button')!.click());
  const signal = history.mock.calls[0][1] as AbortSignal;
  await act(async () => root.render(<SimilarTasks key="second" vault={vault} chatId="other" onOpen={vi.fn()} />));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve([]));
  expect(host.querySelector('article')).toBeNull();
});
