// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('./BundleConversation', () => ({ BundleConversation: (props: { bundleId: string; draftScope: string }) => { calls.render(props); return <textarea aria-label="今回の質問" data-bundle={props.bundleId} />; } }));
import { SupportChat } from './SupportChat';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host);
  vault = new TTVault('vault'); vault.IsLoaded = true;
  for (const id of ['a', 'b']) { const think = new TTThink(); think.ID = id; think.ContentType = 'bundle'; think.Name = id; vault.AddThink(think); }
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(selectedId = '', bundleId = 'a') {
  await act(async () => root.render(<SupportChat vault={vault} selectedId={selectedId} bundleId={bundleId} panelName="Thinktank"
    onSelected={vi.fn()} onMessages={vi.fn()} onWaiting={vi.fn()} modelSelector={{ value: { provider: 'openai', model: 'unused' }, onChange: vi.fn() }} />));
}
async function click(label: string) { await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === label)!.click()); }
it('offers new conversation without history selection and requires explicit Bundle selection', async () => {
  await show(); expect(host.querySelector('select')).not.toBeNull(); expect(calls.render).not.toHaveBeenCalled();
  await click('表示中・関連するBundleを選ぶ'); expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBe('a');
  expect(calls.render.mock.calls.at(-1)?.[0].draftScope).toBe('aichat:Thinktank:panel');
});
it('keeps the chosen Bundle when the surrounding Overview Bundle changes', async () => {
  await show(); await click('表示中・関連するBundleを選ぶ'); await show('', 'b');
  expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBe('a');
  await click('表示中・関連するBundleを選ぶ'); expect(host.querySelector('textarea')?.getAttribute('data-bundle')).toBe('b');
});
it('opens legacy selections as read-only and switches explicitly to the new conversation', async () => {
  const old = new TTThink(); old.ID = 'old'; old.ContentType = 'chat'; old.Content = '旧会話\n## 質問\n回答'; vault.AddThink(old);
  await show('old'); expect(host.textContent).toContain('閲覧専用'); expect(host.querySelector('textarea')).toBeNull();
  await click('AIに相談する'); await click('表示中・関連するBundleを選ぶ'); expect(host.querySelector('textarea')).not.toBeNull();
  await click('これまでの会話'); expect(host.textContent).toContain('閲覧専用'); expect(old.Content).toContain('回答');
});
