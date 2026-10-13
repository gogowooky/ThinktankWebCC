// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { emptyThinkValues } from '../../../server/contracts/thinkSupportRecord';
import type { ConversationTurn } from '../../services/ConversationService';
import { ProposalReview } from './ProposalReview';
import { resetDraftStores } from '../../services/draftStore';
const api = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('../../services/ThinkSupportService', async () => ({
  ...await vi.importActual('../../services/ThinkSupportService'),
  ThinkSupportService: class { read = api.read; save = api.save; },
}));
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, vault: TTVault;
const turn = { context: { scope: 'bundle-only', bundleId: 'bundle', vaultId: 'vault' }, answer: {
  proposals: [{ field: 'goal', before: '', after: '誕生日会を開催する', reason: '本人の相談' }],
} } as ConversationTurn;
beforeEach(() => {
  resetDraftStores();
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  const bundle = new TTThink(); bundle.ID = 'bundle'; bundle.ContentType = 'bundle'; vault.AddThink(bundle);
  api.read.mockResolvedValue({ thinkid: 'bundle', category: 'bundle', updatedAt: 'version-1', metadata: {} });
  api.save.mockResolvedValue({ thinkid: 'bundle', updatedAt: 'version-2', metadata: {} });
});
afterEach(async () => { await act(async () => root.unmount()); resetDraftStores(); vi.unstubAllGlobals(); });
async function click(label: string) {
  await act(async () => { [...host.querySelectorAll('button')].find(b => b.textContent === label)!.click(); });
}
it.each(['resolve', 'reject'])('ignores an outstanding proposal save %s after reset', async outcome => {
  let resolve!: (value: unknown) => void, reject!: (reason: Error) => void;
  api.save.mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  await act(async () => root.render(<ProposalReview vault={vault} turn={turn} disabled={false} />));
  await click('課題の概要に反映する内容を確認'); await click('この内容で反映');
  const before = structuredClone(vault.GetThink('bundle')!.Metadata), notify = vi.spyOn(vault, 'NotifyUpdated');
  resetDraftStores(); const add = vi.spyOn(window, 'addEventListener');
  await act(async () => {
    if (outcome === 'resolve') resolve({ thinkid: 'bundle', updatedAt: 'version-2', metadata: { thinkSupport: { changed: true } } });
    else reject(new Error('expired save'));
  });
  expect(vault.GetThink('bundle')!.Metadata).toEqual(before); expect(notify).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('反映しました'); expect(host.textContent).not.toContain('expired save');
  expect(add.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(0); add.mockRestore();
});
it('requires a review then confirmation before saving the original Bundle', async () => {
  await act(async () => root.render(<ProposalReview vault={vault} turn={turn} disabled={false} />));
  expect(api.read).not.toHaveBeenCalled(); expect(api.save).not.toHaveBeenCalled();
  await click('課題の概要に反映する内容を確認');
  expect(host.textContent).toContain('誕生日会を開催する'); expect(api.save).not.toHaveBeenCalled();
  await click('この内容で反映');
  expect(api.save).toHaveBeenCalledWith('bundle', 'version-1', { ...emptyThinkValues(), goal: '誕生日会を開催する' }, {});
  expect(host.textContent).toContain('反映しました');
});
it('requires a new review after a save conflict and never silently retries', async () => {
  api.save.mockRejectedValue(Object.assign(new Error('conflict'), { name: 'StorageConflictError' }));
  await act(async () => root.render(<ProposalReview vault={vault} turn={turn} disabled={false} />));
  await click('課題の概要に反映する内容を確認'); await click('この内容で反映');
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('別の更新');
  expect([...host.querySelectorAll('button')].some(b => b.textContent === 'この内容で反映')).toBe(false);
});
