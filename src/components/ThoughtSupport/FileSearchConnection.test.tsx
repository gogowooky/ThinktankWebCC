// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ status: vi.fn(), listStores: vi.fn() }));
vi.mock('../../services/FileSearchClient', () => ({ FileSearchClient: class { status = api.status; listStores = api.listStores; } }));
import { FileSearchConnection } from './FileSearchConnection';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host);
  api.status.mockResolvedValue({ provider: 'gemini-file-search', enabled: true, connectionId: 'work', mode: 'read-only' }); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function show() { await act(async () => root.render(<FileSearchConnection />)); }
it('performs no requests on display and never contacts Google when disabled', async () => {
  api.status.mockResolvedValue({ provider: 'gemini-file-search', enabled: false, connectionId: null, mode: 'read-only' });
  await show(); expect(api.status).not.toHaveBeenCalled(); expect(button('接続先のストア一覧を取得').disabled).toBe(true);
  await click('File Searchの設定を取得'); expect(button('接続先のストア一覧を取得').disabled).toBe(true); expect(api.listStores).not.toHaveBeenCalled();
});
it('uses separate explicit operations for settings, first page and subsequent pages', async () => {
  api.listStores.mockResolvedValueOnce({ connectionId: 'work', checkedAt: '2026-09-14T00:00:00Z', stores: [{ name: 'fileSearchStores/a', displayName: '<script>x</script>', activeDocuments: '1', pendingDocuments: null, failedDocuments: null }], nextPageToken: 'next' })
    .mockResolvedValueOnce({ connectionId: 'work', checkedAt: '2026-09-14T00:01:00Z', stores: [], nextPageToken: null });
  await show(); await click('File Searchの設定を取得'); expect(api.listStores).not.toHaveBeenCalled();
  await click('接続先のストア一覧を取得'); expect(host.querySelector('script')).toBeNull(); expect(host.textContent).toContain('処理中：不明');
  await click('次のストアページを取得'); expect(api.listStores.mock.calls[1].slice(0, 2)).toEqual(['work', 'next']); expect(host.textContent).toContain('最終ページ');
});
it('cancels a pending check and retains the ability to retry', async () => {
  api.listStores.mockImplementation((_id, _token, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))));
  await show(); await click('File Searchの設定を取得'); await click('接続先のストア一覧を取得'); await click('接続確認を中断');
  expect(host.textContent).toContain('接続確認を中断しました'); expect(button('接続先のストア一覧を取得').disabled).toBe(false);
});
