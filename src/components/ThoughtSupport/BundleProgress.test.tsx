// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('../../services/ProgressService', () => ({ ProgressService: class { read = api.read; save = api.save; } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { BundleProgress } from './BundleProgress';
import { TTVault } from '../../models/TTVault';
import { emptyProgress, type ProgressInput } from '../../../server/services/progressRecord';
const state = (bundleId = 'a', input?: ProgressInput) => ({ bundleId, version: '2026-09-14T00:00:00Z',
  log: { schemaVersion: 1, events: input ? [{ id: 'saved', revision: 1, author: 'human', confirmedAt: '2026-09-14T00:00:00Z', input }] : [] },
  review: { goal: '目的', nextAction: '次の行動', completionCriteria: '条件', notes: [] } });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  api.read.mockImplementation(async id => state(id)); api.save.mockImplementation(async (id, _version, _op, input) => state(id, input));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(id = 'a') { await act(async () => root.render(<BundleProgress vault={vault} bundleId={id} onOpen={vi.fn()} />)); }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function input(index: number, value: string) { await act(async () => { const el = host.querySelectorAll('textarea')[index]; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function confirm() { await act(async () => (host.querySelectorAll('fieldset input[type=checkbox]')[1] as HTMLInputElement).click()); }
it('requires confirmation, preserves drafts across switches, and saves the original Bundle', async () => {
  await show(); expect(api.read).not.toHaveBeenCalled(); await click('到達状態を取得・比較');
  await input(0, '実施を確認'); await input(1, '検証が残る'); expect(button('到達状態を保存').disabled).toBe(true);
  await show('b'); await click('到達状態を取得・比較'); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  await show('a'); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('実施を確認');
  await confirm(); await click('到達状態を保存'); expect(api.save).toHaveBeenCalledWith('a', expect.any(String), expect.any(String), expect.objectContaining({ evidence: '実施を確認' }));
});
it('requires a fresh confirmation after comparing a conflicting remote state', async () => {
  await show(); await click('到達状態を取得・比較'); await input(0, '自分の根拠'); await input(1, 'なし');
  api.save.mockRejectedValueOnce(new Error('保存競合')); await confirm(); await click('到達状態を保存');
  api.read.mockResolvedValue(state('a', { ...emptyProgress(), evidence: '別の根拠', remaining: '残課題' }));
  await click('到達状態を取得・比較'); expect(host.textContent).toContain('別の根拠'); await click('比較後、現在の入力を再確認');
  expect(button('到達状態を保存').disabled).toBe(true); expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('自分の根拠');
  await confirm(); await click('到達状態を保存'); expect(host.textContent).toContain('到達状態を保存しました');
});
it('does not display a delayed read under another Bundle', async () => {
  let resolve!: (value: unknown) => void;
  api.read.mockImplementation(id => id === 'a' ? new Promise(r => { resolve = r; }) : Promise.resolve(state('b')));
  await show(); await click('到達状態を取得・比較'); await show('b'); await click('到達状態を取得・比較');
  await act(async () => resolve(state('a', { ...emptyProgress(), evidence: 'Aだけの根拠', remaining: 'なし' })));
  expect(host.textContent).not.toContain('Aだけの根拠'); await show('a'); expect(host.textContent).toContain('Aだけの根拠');
});
it('does not persist a pause without a resumption condition', async () => {
  await show(); await click('到達状態を取得・比較'); await input(0, '待機する'); await input(1, '回答待ち');
  await act(async () => (host.querySelector('fieldset input[type=checkbox]') as HTMLInputElement).click());
  await confirm(); await click('到達状態を保存'); expect(api.save).not.toHaveBeenCalled(); expect(host.textContent).toContain('保留には再開条件が必要');
});
