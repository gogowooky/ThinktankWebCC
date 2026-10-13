// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AiChatView } from './AiChatView';
vi.mock('../../hooks/useAiProviderAvailability', () => ({ useAiProviderAvailability: () => ({ anthropic: true, openai: true, gemini: true }) }));
afterEach(() => vi.unstubAllGlobals());
it('animates the prompt while waiting and places a working undo icon after explanation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const undo = vi.fn();
  const render = (waiting: boolean) => <AiChatView messages={[]} isWaiting={waiting} onSend={() => {}}
    modelSelector={{ value: { provider: 'gemini', model: 'gemini-3.5-flash' }, onChange: () => {} }}
    explanationSelector={{ value: '標準', onChange: () => {} }} undoManagement={{ disabled: false, onClick: undo }} />;
  try {
    await act(async () => root.render(render(true)));
    expect(host.querySelector('.ai-chat-view__input-prompt--waiting')?.textContent).toBe('>');
    const button = host.querySelector<HTMLButtonElement>('[aria-label="直前の管理変更を戻す"]')!;
    expect(button.disabled).toBe(true);
    expect(button.previousElementSibling?.className).toBe('ai-chat-view__explanation');
    await act(async () => root.render(render(false)));
    expect(host.querySelector('.ai-chat-view__input-prompt--waiting')).toBeNull();
    await act(async () => button.click());
    expect(undo).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it('keeps rejected input and clears it only when accepted', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const onSend = vi.fn().mockReturnValue(false);
  try {
    await act(async () => root.render(<AiChatView messages={[]} isWaiting={false} onSend={onSend} />));
    const input = host.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '続けたい');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const enter = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await act(async () => { enter(); });
    expect(onSend).toHaveBeenCalledWith('続けたい');
    expect(input.value).toBe('続けたい');
    onSend.mockReturnValue(true);
    await act(async () => { enter(); });
    expect(input.value).toBe('');
  } finally { await act(async () => root.unmount()); host.remove(); }
});
