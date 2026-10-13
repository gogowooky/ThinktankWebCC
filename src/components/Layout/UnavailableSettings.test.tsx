// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DiscussTabBar } from '../DiscussPanel/DiscussTabBar';
import { HarvestTabBar } from '../HarvestPanel/HarvestTabBar';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it('keeps placeholder Discuss settings disabled while implemented settings remain usable', async () => {
  const select = vi.fn();
  await act(async () => root.render(<DiscussTabBar activeSettings="panes" isOpen={true} thinkTitle="" onToggle={vi.fn()} onSetActiveSettings={select} />));
  for (const id of ['Markdown', 'Card', 'Graph']) {
    const button = host.querySelector<HTMLButtonElement>(`#${id}`)!;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain('未実装');
    await act(async () => button.click());
  }
  expect(select).not.toHaveBeenCalled();
  const textEditor = host.querySelector<HTMLButtonElement>('#TextEditor')!;
  expect(textEditor.disabled).toBe(false);
  await act(async () => textEditor.click());
  expect(select).toHaveBeenCalledWith('texteditor');
});

it('does not open placeholder Harvest settings and keeps the conversation tab usable', async () => {
  const select = vi.fn();
  await act(async () => root.render(<HarvestTabBar isOpen={true} viewMode="chat" onToggle={vi.fn()} onSetMode={select} />));
  const settings = host.querySelector<HTMLButtonElement>('#HarvestSetting')!;
  expect(settings.disabled).toBe(true);
  expect(settings.title).toContain('未実装');
  await act(async () => settings.click());
  expect(select).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLButtonElement>('#HarvestAI')!.click());
  expect(select).toHaveBeenCalledWith('chat');
});
