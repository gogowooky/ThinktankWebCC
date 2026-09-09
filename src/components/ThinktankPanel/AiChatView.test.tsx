// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AiChatView } from './AiChatView';
vi.mock('../../hooks/useAiProviderAvailability', () => ({ useAiProviderAvailability: () => ({ anthropic: true, openai: true, gemini: true }) }));
afterEach(() => vi.unstubAllGlobals());
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
