// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const panel = () => ({ SetViewMode: vi.fn(), OpenArea: vi.fn() });
  return { app: { Models: { Vault: { GetThink: vi.fn(), VaultName: 'vault' } },
    OverviewPanel: { ...panel(), BundleID: 'parent', OpenBundle: vi.fn() },
    WorkoutPanel: panel(), ThinktankPanel: panel(), ReThinkPanel: panel() } };
});
vi.mock('../views/TTApplication', () => ({ TTApplication: { get Instance() { return mocks.app; } } }));
import { openSupportChat } from './openSupportChat';
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
it('opens the dedicated task and Workout area, preserving the Chat selection for a closed area', () => {
  mocks.app.Models.Vault.GetThink.mockReturnValue({ Name: 'ASK:Workout｜会場予約', Metadata: { subtaskChat: { schemaVersion: 1, bundleId: 'child' } } });
  const listener = vi.fn(); window.addEventListener('thinktank-support-open', listener);
  try {
    openSupportChat('chat');
    expect(mocks.app.OverviewPanel.OpenBundle).toHaveBeenCalledWith('child', 'graph');
    expect(mocks.app.WorkoutPanel.SetViewMode).toHaveBeenCalledWith('chat');
    expect(mocks.app.WorkoutPanel.OpenArea).toHaveBeenCalled();
    expect(localStorage.getItem('thinktank.support.selection:vault:Workout')).toBe('chat');
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ panel: 'Workout', id: 'chat' });
  } finally { window.removeEventListener('thinktank-support-open', listener); }
});
it('preserves the existing routing for ordinary consultation Chats', () => {
  mocks.app.Models.Vault.GetThink.mockReturnValue({ Name: 'ASK:Thinktank｜相談', Metadata: {} });
  openSupportChat('original');
  expect(mocks.app.ThinktankPanel.SetViewMode).toHaveBeenCalledWith('chat');
  expect(mocks.app.OverviewPanel.OpenBundle).not.toHaveBeenCalled();
});
