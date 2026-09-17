// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ensure: vi.fn(), open: vi.fn(), app: { Models: { Vault: {} }, OverviewPanel: { BundleID: 'parent' } } }));
vi.mock('../../services/subtaskChat', () => ({ ensureSubtaskChat: mocks.ensure }));
vi.mock('../../services/openSupportChat', () => ({ openSupportChat: mocks.open }));
vi.mock('../../views/TTApplication', () => ({ TTApplication: { get Instance() { return mocks.app; } } }));
import { TTVault } from '../../models/TTVault';
import { SubtaskChatButton } from './SubtaskChatButton';
let root: ReturnType<typeof createRoot>, host: HTMLDivElement, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  mocks.app.Models.Vault = vault; mocks.app.OverviewPanel.BundleID = 'parent'; mocks.ensure.mockResolvedValue({ ID: 'chat' });
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show() { await act(async () => root.render(<SubtaskChatButton vault={vault} bundleId="child" overviewId="parent" />)); }
async function click() { await act(async () => host.querySelector('button')!.click()); }
it('creates only on request, opens the saved Chat and supports failure retry', async () => {
  await show(); expect(mocks.ensure).not.toHaveBeenCalled();
  mocks.ensure.mockRejectedValueOnce(new Error('保存失敗')); await click();
  expect(host.textContent).toContain('保存失敗'); expect(mocks.open).not.toHaveBeenCalled();
  await click(); expect(mocks.ensure).toHaveBeenCalledWith(vault, 'child'); expect(mocks.open).toHaveBeenCalledWith('chat');
});
it('does not navigate after the user changes the current task', async () => {
  let finish!: (value: { ID: string }) => void;
  mocks.ensure.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await show(); await click(); expect(host.querySelector('button')!.disabled).toBe(true);
  mocks.app.OverviewPanel.BundleID = 'other';
  await act(async () => finish({ ID: 'chat' })); expect(mocks.open).not.toHaveBeenCalled();
});
