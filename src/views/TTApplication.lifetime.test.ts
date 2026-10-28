// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const models = vi.hoisted(() => ({ vault: undefined as unknown }));
vi.mock('../models/TTModels', () => ({ TTModels: { get Instance() { return { Vault: models.vault }; } } }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { TTVault } from '../models/TTVault';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';
import { setAvailableModels } from '../services/aiChatModelStatus';
import { createDraftStore, hasUnsavedDrafts, resetDraftStores } from '../services/draftStore';
import { TTShortcutManager } from './TTShortcutManager';
import { TTThinktankPanel } from './TTThinktankPanel';
import { TTSeedsPanel } from './TTSeedsPanel';
import { TTWorkingPanel } from './TTWorkingPanel';
import { TTHarvestPanel } from './TTHarvestPanel';

beforeEach(() => { TTApplication.resetInstance(); resetDraftStores(); localStorage.clear(); models.vault = new TTVault(); vi.useFakeTimers(); });
afterEach(() => { TTApplication.resetInstance(); resetDraftStores(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('detaches shortcut status subscriptions and retains only the new application target', () => {
  const shortcuts = TTShortcutManager.instance;
  const first = TTApplication.Instance; shortcuts.init(first); shortcuts.init(first);
  expect(first.Status.ListenerKeys.filter(key => key === 'TTShortcutManager-exmode')).toHaveLength(1);
  const change = vi.spyOn(shortcuts, 'onExModeChange');
  TTApplication.resetInstance();
  const second = TTApplication.Instance; shortcuts.init(second);
  change.mockClear(); first.Status.SetExMode('old', '');
  expect(change).not.toHaveBeenCalled();
  second.Status.SetExMode('new', '');
  expect(change).toHaveBeenCalledWith('new');
  expect(first.Status.ListenerKeys).not.toContain('TTShortcutManager-exmode');
});

it('disposes only the Vault it owned even when Models change before public dispose and reset', () => {
  const app = TTApplication.Instance, first = app.Models.Vault;
  const drafts = createDraftStore<{ text: string }>(draft => !!draft.text);
  drafts.get(first, 'a', () => ({ text: 'old app' }));
  const next = new TTVault(first.ID); models.vault = next;
  const independent = drafts.get(next, 'a', () => ({ text: 'new model input' }));
  app.dispose(); TTApplication.resetInstance(); app.dispose();
  expect(drafts.get(next, 'a', () => ({ text: '' }))).toBe(independent);
  expect(independent.text).toBe('new model input');
  expect(hasUnsavedDrafts()).toBe(true);
});

it('updates ownership when the live application accesses a replacement Models Vault', () => {
  const app = TTApplication.Instance, first = app.Models.Vault;
  const drafts = createDraftStore<{ text: string }>(draft => !!draft.text);
  const oldMap = drafts.map(first); drafts.get(first, 'a', () => ({ text: 'old input' }));
  models.vault = new TTVault(first.ID);
  const second = app.Models.Vault;
  expect(oldMap.size).toBe(0);
  drafts.get(second, 'a', () => ({ text: 'current input' }));
  TTApplication.resetInstance(); app.dispose();
  expect(hasUnsavedDrafts()).toBe(false);
});

it('removes every wildcard listener and model subscription on repeated application resets', () => {
  const manager = TTUIStateManager.instance;
  const add = vi.spyOn(manager, 'addListener'), remove = vi.spyOn(manager, 'removeListener');
  for (let cycle = 0; cycle < 3; cycle++) {
    const app = TTApplication.Instance;
    const notify = vi.spyOn(app.ThinktankPanel, 'NotifyUpdated');
    expect(add.mock.calls).toHaveLength((cycle + 1) * 13);
    manager.init(app);
    expect(app.ListenerKeys).toContain('TTUIStateManager');
    notify.mockClear();
    TTApplication.resetInstance();
    app.dispose();
    expect(app.ListenerKeys).not.toContain('TTUIStateManager');
    expect(remove.mock.calls).toHaveLength((cycle + 1) * 13);
    setAvailableModels('Claude', []);
    expect(notify).not.toHaveBeenCalled();
    expect((window as Window & { ttApp?: TTApplication }).ttApp).toBeUndefined();
  }
  for (const call of add.mock.calls) expect(remove.mock.calls).toContainEqual(call);
});

it('detaches the old manager root and pending debounce save while resetting hidden drafts', () => {
  const manager = TTUIStateManager.instance, app = TTApplication.Instance;
  manager.init(app);
  const draft = createDraftStore<{ text: string }>(value => !!value.text);
  draft.get(app.Models.Vault, 'same-id', () => ({ text: 'hidden input' }));
  app.NotifyUpdated();
  const save = vi.spyOn(Storage.prototype, 'setItem'); save.mockClear();
  TTApplication.resetInstance();
  vi.runOnlyPendingTimers();
  expect(save).not.toHaveBeenCalled();
  expect(manager.getLatestContent()).toBeNull();
  expect(hasUnsavedDrafts()).toBe(false);
  const next = TTApplication.Instance;
  manager.init(next);
  const oldUpdate = vi.spyOn(app.ThinktankPanel, 'NotifyUpdated');
  const nextUpdate = vi.spyOn(next.ThinktankPanel, 'NotifyUpdated');
  manager.applyProperty('ThinktankPanel.Mode.Name', 'Filter');
  expect(oldUpdate).not.toHaveBeenCalled();
  expect(nextUpdate).toHaveBeenCalled();
});

it.each([TTThinktankPanel, TTSeedsPanel, TTWorkingPanel, TTHarvestPanel])('disposes the model-name subscription for %s', Panel => {
  const panel = new Panel(), notify = vi.spyOn(panel, 'NotifyUpdated');
  setAvailableModels('Claude', []);
  expect(notify).toHaveBeenCalledTimes(1);
  panel.dispose(); panel.dispose(); notify.mockClear();
  setAvailableModels('Claude', []);
  expect(notify).not.toHaveBeenCalled();
  expect(panel._parent).toBeNull();
});
