import { afterEach, expect, it, vi } from 'vitest';
import { configuredFileSearchProvider, GeminiFileSearchProvider } from './FileSearchProvider';
const env = { THINK_SUPPORT_FILE_SEARCH_ENABLED: 'true', THINK_SUPPORT_FILE_SEARCH_CONNECTION_ID: 'work', THINK_SUPPORT_FILE_SEARCH_API_KEY: 'private-key' };
const store = { name: 'fileSearchStores/store-123', displayName: '資料', activeDocumentsCount: '12345678901234567890', pendingDocumentsCount: '0' };
afterEach(() => vi.useRealTimers());
it('is disabled unless every dedicated setting is valid and never exposes the key in status', async () => {
  const request = vi.fn();
  for (const changes of [{ THINK_SUPPORT_FILE_SEARCH_ENABLED: undefined }, { THINK_SUPPORT_FILE_SEARCH_API_KEY: '' }, { THINK_SUPPORT_FILE_SEARCH_CONNECTION_ID: '../bad' }]) {
    const provider = configuredFileSearchProvider({ ...env, ...changes }, request);
    expect(provider.status().enabled).toBe(false); await expect(provider.listStores('work')).rejects.toThrow('停止');
  }
  expect(request).not.toHaveBeenCalled(); expect(JSON.stringify(configuredFileSearchProvider(env, request).status())).not.toContain('private-key');
});
it('uses a fixed read-only endpoint, header authentication and opaque encoded pagination', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ fileSearchStores: [store], nextPageToken: 'next+/=' })));
  const page = await new GeminiFileSearchProvider('work', 'private-key', request).listStores('work', 'token+/=');
  const [url, options] = request.mock.calls[0]; const target = new URL(url);
  expect(target.origin).toBe('https://generativelanguage.googleapis.com'); expect(target.searchParams.get('pageToken')).toBe('token+/='); expect(target.searchParams.get('pageSize')).toBe('20');
  expect(url).not.toContain('private-key'); expect(options).toMatchObject({ method: 'GET', redirect: 'error', headers: { 'x-goog-api-key': 'private-key' } }); expect(options.body).toBeUndefined();
  expect(page.stores[0]).toMatchObject({ activeDocuments: '12345678901234567890', failedDocuments: null }); expect(page.nextPageToken).toBe('next+/=');
});
it('rejects old connection identities and malformed tokens before sending', async () => {
  const request = vi.fn(); const provider = new GeminiFileSearchProvider('work', 'key', request);
  await expect(provider.listStores('old')).rejects.toMatchObject({ status: 409 });
  await expect(provider.listStores('work', '\n')).rejects.toMatchObject({ status: 400 }); expect(request).not.toHaveBeenCalled();
});
it('keeps provider error details and network exceptions out of client errors', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response('private-key', { status: 403 })).mockRejectedValueOnce(new Error('private-key'));
  const provider = new GeminiFileSearchProvider('work', 'private-key', request);
  for (let i = 0; i < 2; i++) {
    try { await provider.listStores('work'); throw new Error('Expected failure'); } catch (e) { expect(e).toMatchObject({ status: 502 }); expect(String(e)).not.toContain('private-key'); }
  }
});
it('validates upstream names, counts, page sizes and repeated cursors', async () => {
  for (const raw of [{ fileSearchStores: [{ ...store, name: 'https://evil.test' }] }, { fileSearchStores: [{ ...store, activeDocumentsCount: -1 }] },
    { fileSearchStores: Array(21).fill(store) }, { fileSearchStores: [], nextPageToken: 'same' }]) {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw)));
    await expect(new GeminiFileSearchProvider('work', 'key', request).listStores('work', 'same')).rejects.toMatchObject({ status: 502 });
  }
});
it('accepts an empty final page and reports rate limits without raw response bodies', async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('private-key', { status: 429 }));
  const provider = new GeminiFileSearchProvider('work', 'key', request);
  expect(await provider.listStores('work')).toMatchObject({ stores: [], nextPageToken: null });
  await expect(provider.listStores('work')).rejects.toMatchObject({ status: 429 });
});
it('aborts a slow request after the bounded timeout', async () => {
  vi.useFakeTimers(); const request = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const result = new GeminiFileSearchProvider('work', 'key', request).listStores('work');
  const assertion = expect(result).rejects.toMatchObject({ status: 504 }); await vi.advanceTimersByTimeAsync(15000); await assertion;
});
