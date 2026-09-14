// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('../../services/ThinkSupportService', async original => ({ ...(await original<object>()), ThinkSupportService: class { read = api.read; save = api.save; } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
vi.mock('../../services/ContextService', () => ({ ContextService: class { getBundleContext = async () => { throw new Error('資料の一部を取得できません'); }; } }));
import { BundleThoughtSupport } from './BundleThoughtSupport';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { emptyThinkValues } from '../../services/ThinkSupportService';
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>; let vault: TTVault;
function meta(id: string, goal = '', revision = 1) { return { id, contentType: 'bundle', updatedAt: `v${revision}`, metadata: { thinkSupport: { schemaVersion: 1, revision, values: { ...emptyThinkValues(), goal }, sources: {}, author: 'human', confirmedAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z' } } }; }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  host = document.createElement('div'); root = createRoot(host); vault = new TTVault('test');
  for (const id of ['a', 'b']) { const t = new TTThink(); t.ID = id; t.ContentType = 'bundle'; t.Content = '課題'; t.markSaved(); vault.AddItem(t); }
  api.read.mockImplementation(async id => meta(id));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(id: string) { await act(async () => root.render(<BundleThoughtSupport vault={vault} bundleId={id} onOpen={vi.fn()} />)); }
async function input(value: string) { await act(async () => { const el = host.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function click(text: string) { await act(async () => { const button = [...host.querySelectorAll('button')].find(b => b.textContent === text)!; expect(button.disabled).toBe(false); button.click(); }); }
async function confirm() { await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click()); }
it('keeps drafts across Bundle switches and requires confirmation before saving', async () => {
  await show('a'); await input('本人の目的');
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('本人の目的');
  expect([...host.querySelectorAll('button')].find(b => b.textContent === '思考状態を保存')!.disabled).toBe(true);
  await show('b'); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  await show('a'); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('本人の目的');
  api.save.mockResolvedValue(meta('a', '本人の目的', 2)); await confirm(); await click('思考状態を保存');
  expect(api.save).toHaveBeenCalledWith('a', 'v1', expect.objectContaining({ goal: '本人の目的' }), {});
  expect(host.textContent).toContain('手動記録を保存しました');
});
it('retains input on conflict, then requires comparison and fresh confirmation', async () => {
  await show('a'); await input('自分の入力');
  api.save.mockRejectedValue(Object.assign(new Error('conflict'), { name: 'StorageConflictError' }));
  await confirm(); await click('思考状態を保存');
  expect(host.textContent).toContain('保存競合'); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('自分の入力');
  api.read.mockResolvedValue(meta('a', '別の記録', 2)); await click('最新の保存内容を確認');
  expect(host.textContent).toContain('別の記録'); await click('比較を終え、現在の入力で再確認する');
  expect((host.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
  api.save.mockResolvedValue(meta('a', '自分の入力', 3)); await confirm(); await click('思考状態を保存');
  expect(api.save).toHaveBeenLastCalledWith('a', 'v2', expect.objectContaining({ goal: '自分の入力' }), {});
});
it('does not publish a late read from a different Bundle', async () => {
  let resolve!: (value: unknown) => void;
  api.read.mockImplementation(id => id === 'a' ? new Promise(r => { resolve = r; }) : Promise.resolve(meta('b', 'Bの記録')));
  await show('a'); await show('b'); await act(async () => resolve(meta('a', 'Aの記録')));
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Bの記録');
});
it('finishes a delayed save on its original Bundle while preserving other metadata and the active draft', async () => {
  let resolve!: (value: unknown) => void;
  api.save.mockImplementation(() => new Promise(r => { resolve = r; }));
  const a = vault.GetThink('a')!; a.Metadata = { thoughtSupport: { goal: 'old' }, other: 1 }; a.markMetadataSaved();
  await show('a'); await input('Aの入力'); await confirm(); await click('思考状態を保存');
  await show('b'); await input('Bの入力');
  await act(async () => resolve(meta('a', 'Aの入力', 2)));
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Bの入力');
  expect(a.Metadata).toMatchObject({ thoughtSupport: { goal: 'old' }, other: 1, thinkSupport: { values: { goal: 'Aの入力' } } });
  expect(vault.GetThink('b')!.Metadata.thinkSupport).toBeUndefined();
});
it('does not change live metadata on a failed save', async () => {
  const a = vault.GetThink('a')!; const before = JSON.stringify(a.Metadata);
  api.save.mockRejectedValue(new Error('offline')); await show('a'); await input('失わない入力'); await confirm(); await click('思考状態を保存');
  expect(JSON.stringify(a.Metadata)).toBe(before);
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('失わない入力');
  expect(host.textContent).toContain('offline');
});
it('can edit and save again after adopting the remote record', async () => {
  await show('a'); await input('破棄する入力');
  api.read.mockResolvedValue(meta('a', '採用する保存内容', 2));
  await click('最新の保存内容を確認'); await click('入力を破棄し、保存内容を採用');
  expect(host.querySelector('[aria-label="保存内容との比較"]')).toBeNull();
  expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('採用する保存内容');
  await input('採用後の追記'); await confirm();
  api.save.mockResolvedValue(meta('a', '採用後の追記', 3)); await click('思考状態を保存');
  expect(api.save).toHaveBeenLastCalledWith('a', 'v2', expect.objectContaining({ goal: '採用後の追記' }), {});
});
