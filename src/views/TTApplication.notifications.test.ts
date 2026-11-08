// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';

let app: TTApplication;

beforeEach(() => {
  app = TTApplication.Instance;
  TTUIStateManager.instance.init(app);
});

afterEach(() => {
  TTApplication.resetInstance();
  vi.restoreAllMocks();
});

it('does not redraw the Working panel for cursor status, but still emits it', () => {
  const redraw = vi.fn();
  const statusListener = vi.fn();
  app.WorkingPanel.AddOnUpdate('test', redraw);
  TTUIStateManager.instance.addListener('*', statusListener);

  TTUIStateManager.instance.notifyConstPropertiesChanged([
    'TextEditor.CurrentFolding.HeadingOffset',
    'TextEditor.CurrentEditor.CursorPos',
  ]);

  expect(redraw).not.toHaveBeenCalled();
  expect(statusListener).toHaveBeenCalledTimes(2);
  TTUIStateManager.instance.removeListener('*', statusListener);
});

it('notifies the application once for a batch of cursor status', () => {
  const update = vi.fn();
  app.AddOnUpdate('test', update);

  TTUIStateManager.instance.notifyConstPropertiesChanged([
    'TextEditor.CurrentFolding.HeadingOffset',
    'TextEditor.CurrentFolding.HeadingNumber',
    'TextEditor.CurrentEditor.CursorPos',
    'TextEditor.CurrentEditor.TextOnCursorPos',
  ]);

  expect(update).toHaveBeenCalledTimes(1);
});

it('still redraws the Working panel for editor settings', () => {
  const redraw = vi.fn();
  app.WorkingPanel.AddOnUpdate('test', redraw);

  TTUIStateManager.instance.applyProperty('TextEditor.WordWrap.IsVisible', 'toggle');

  expect(redraw).toHaveBeenCalled();
});

it('redraws every panel, including the one that changed the checks', () => {
  const panels = [app.ThinktankPanel, app.SeedsPanel, app.WorkingPanel, app.HarvestPanel];
  const redraws = panels.map(panel => {
    const redraw = vi.fn();
    panel.AddOnUpdate('test', redraw);
    return redraw;
  });

  app.ThinktankPanel.ToggleCheck('2026-11-07-000000');

  for (const redraw of redraws) expect(redraw).toHaveBeenCalled();
  expect(app.SeedsPanel.CheckedThoughtIDs).toEqual(['2026-11-07-000000']);
});
