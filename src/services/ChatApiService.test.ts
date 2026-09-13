import { expect, it, vi } from 'vitest';
import { streamChat } from './ChatApiService';

it('rejects legacy callers without making a network request', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const callbacks = { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
  try {
    await streamChat([{ role: 'user', content: 'private' }], 'private context', callbacks);
    expect(fetch).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('停止中'));
    expect(callbacks.onDelta).not.toHaveBeenCalled();
    expect(callbacks.onDone).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
