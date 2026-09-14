// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ readBinding: vi.fn(), saveBinding: vi.fn() }));
vi.mock('../../services/FileSearchClient', () => ({ FileSearchClient: class { readBinding = api.readBinding; saveBinding = api.saveBinding; } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { BundleFileSearchBinding } from './BundleFileSearchBinding';
import { TTVault } from '../../models/TTVault';
const state = (bundleId = 'a') => ({ bundleId, version: '2026-09-14T00:00:00Z', log: { schemaVersion: 1, events: [] } });
const status = { provider: 'gemini-file-search' as const, connectionId: 'work', enabled: true, mode: 'read-only' as const };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  api.readBinding.mockImplementation(async id => state(id)); api.saveBinding.mockImplementation(async id => state(id)); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(bundleId = 'a') { await act(async () => root.render(<BundleFileSearchBinding vault={vault} bundleId={bundleId} status={status} />)); }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function input(value: string) { await act(async () => { const target = host.querySelector('input:not([type=checkbox])')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value); target.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function confirm() { await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click()); }
it('does not access storage on display and requires version, valid store ID and confirmation', async () => {
  await show(); expect(api.readBinding).not.toHaveBeenCalled(); await input('fileSearchStores/a'); await confirm(); expect(button('ストア対応を保存').disabled).toBe(true);
  await click('登録済みのストア対応を取得'); expect(button('ストア対応を保存').disabled).toBe(true); await confirm(); await click('ストア対応を保存');
  expect(api.saveBinding).toHaveBeenCalledWith('a', state().version, expect.any(String), { vaultId: 'vault', connectionId: 'work', storeName: 'fileSearchStores/a', previousStoreName: null });
});
it('preserves the operation ID after an uncertain result and revokes approval after edits', async () => {
  api.saveBinding.mockRejectedValueOnce(new Error('保存結果が不明'));
  await show(); await click('登録済みのストア対応を取得'); await input('fileSearchStores/a'); await confirm(); await click('ストア対応を保存'); await click('ストア対応を保存');
  expect(api.saveBinding.mock.calls[0]).toEqual(api.saveBinding.mock.calls[1]); await confirm(); await input('fileSearchStores/b'); expect(button('ストア対応を保存').disabled).toBe(true);
});
it('keeps a late save response with its original Bundle and retains other drafts', async () => {
  let resolve!: (value: ReturnType<typeof state>) => void; api.saveBinding.mockImplementation(() => new Promise(r => { resolve = r; }));
  await show(); await click('登録済みのストア対応を取得'); await input('fileSearchStores/a'); await confirm(); await click('ストア対応を保存');
  await show('b'); await input('fileSearchStores/b'); await act(async () => resolve(state()));
  expect((host.querySelector('input') as HTMLInputElement).value).toBe('fileSearchStores/b'); expect(host.textContent).not.toContain('アクセスを確認し');
  await show(); expect(host.textContent).toContain('対応を保存しました'); expect(api.saveBinding.mock.calls[0][0]).toBe('a');
});
