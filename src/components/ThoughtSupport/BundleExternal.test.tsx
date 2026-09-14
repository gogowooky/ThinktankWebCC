// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), context: vi.fn(), prepare: vi.fn() }));
vi.mock('../../services/ExternalService', () => ({ ExternalService: class { read = api.read; save = api.save; }, prepareExport: api.prepare }));
vi.mock('../../services/ContextService', () => ({ ContextService: class { getBundleContext = api.context; } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { BundleExternal } from './BundleExternal';
import { TTVault } from '../../models/TTVault';
const state = (bundleId = 'a') => ({ bundleId, version: '2026-09-14T00:00:00Z', log: { schemaVersion: 1, events: [] } });
const prepared = (bundleId = 'a') => ({ manifest: { schemaVersion: 1, snapshotId: 'snap', vaultId: 'vault', bundleId, capturedAt: '2026-09-14T00:00:00Z',
  normalizationVersion: 'exact-utf8-v1', status: 'prepared', quality: 'partial', issues: ['欠落資料あり'],
  sources: [{ thinkId: 'source', title: `${bundleId}の資料`, filename: 'source.md', contentHash: 'a'.repeat(64), observedUpdatedAt: '', hasUnsavedChanges: true }] },
  files: [{ name: 'source.md', content: '<script>unsafe</script>' }] });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  api.read.mockImplementation(async id => state(id)); api.save.mockImplementation(async id => state(id));
  api.context.mockImplementation(async id => id); api.prepare.mockImplementation(async id => prepared(id));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(id = 'a') { await act(async () => root.render(<BundleExternal vault={vault} bundleId={id} />)); }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function input(index: number, value: string) {
  const target = host.querySelectorAll('input:not([type=checkbox])')[index];
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value); target.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function approve() { await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click()); }
it('does nothing on display and requires loaded version and confirmation for persistence', async () => {
  await show(); expect(api.read).not.toHaveBeenCalled(); expect(api.context).not.toHaveBeenCalled();
  await input(0, 'work'); await input(1, 'https://notebooklm.google.com/notebook/n'); await approve();
  expect(button('連携先と準備記録を保存').disabled).toBe(true);
  await click('登録済み連携を取得'); expect(button('連携先と準備記録を保存').disabled).toBe(true);
  await approve(); await click('連携先と準備記録を保存');
  expect(api.save).toHaveBeenCalledWith('a', state().version, expect.any(String), expect.objectContaining({ vaultId: 'vault', accountKey: 'work', manifest: null }));
  expect(host.textContent).toContain('外部へのアップロード・同期は未確認');
});
it('prepares read-only files, preserves warnings and displays source text without executing HTML', async () => {
  await show(); await click('書き出す資料を取得');
  expect(api.save).not.toHaveBeenCalled(); expect(host.textContent).toContain('欠落資料あり'); expect(host.textContent).toContain('未保存の編集');
  expect(host.querySelector('pre')?.textContent).toBe('<script>unsafe</script>'); expect(host.querySelector('script')).toBeNull();
});
it('keeps late preparation attached to its original Bundle and retains drafts across switches', async () => {
  let resolve!: (value: string) => void; api.context.mockImplementation(() => new Promise(r => { resolve = r; }));
  await show(); await input(0, 'work'); await click('書き出す資料を取得'); await show('b');
  await act(async () => resolve('a')); expect(host.textContent).not.toContain('aの資料');
  await show(); expect(host.textContent).toContain('aの資料'); expect((host.querySelector('input') as HTMLInputElement).value).toBe('work');
});
it('retries unknown save outcomes with the same operation and invalidates confirmation after edits', async () => {
  api.save.mockRejectedValueOnce(new Error('保存結果が不明'));
  await show(); await click('登録済み連携を取得'); await input(0, 'work'); await input(1, 'https://notebooklm.google.com/notebook/n');
  await approve(); await click('連携先と準備記録を保存'); await click('連携先と準備記録を保存');
  expect(api.save.mock.calls[0]).toEqual(api.save.mock.calls[1]);
  await approve(); await input(1, 'https://notebooklm.google.com/notebook/other'); expect(button('連携先と準備記録を保存').disabled).toBe(true);
});
async function importJson(content: string | Promise<string>) {
  const file = new File(['json'], 'manifest.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  const target = host.querySelector('input[type=file]')!;
  Object.defineProperty(target, 'files', { configurable: true, value: [file] });
  await act(async () => target.dispatchEvent(new Event('change', { bubbles: true })));
}
it('imports and selects a manifest without saving until version and human confirmation are supplied', async () => {
  await show(); await importJson(JSON.stringify(prepared().manifest)); expect(api.save).not.toHaveBeenCalled();
  await click('この対応表を復元候補にする'); expect(host.textContent).toContain('保存する復元候補'); expect(host.textContent).toContain('Vault一覧に同じIDなし');
  await input(0, 'work'); await input(1, 'https://notebooklm.google.com/notebook/n'); await click('登録済み連携を取得');
  expect(button('連携先と準備記録を保存').disabled).toBe(true); await approve(); await click('連携先と準備記録を保存');
  expect(api.save.mock.calls[0][3].manifest).toEqual(prepared().manifest); expect(api.context).not.toHaveBeenCalled();
});
it('rejects another Bundle manifest without creating a recovery candidate', async () => {
  await show(); await importJson(JSON.stringify(prepared('other').manifest));
  expect(host.textContent).toContain('このVault・Bundleの対応表ではありません'); expect(button('この対応表を復元候補にする')).toBeUndefined(); expect(api.save).not.toHaveBeenCalled();
});
it('keeps a late file import with its original Bundle', async () => {
  let resolve!: (value: string) => void; const pending = new Promise<string>(r => { resolve = r; });
  await show(); await importJson(pending); await show('b'); await act(async () => resolve(JSON.stringify(prepared().manifest)));
  expect(button('この対応表を復元候補にする')).toBeUndefined(); await show(); expect(button('この対応表を復元候補にする')).toBeDefined();
});
