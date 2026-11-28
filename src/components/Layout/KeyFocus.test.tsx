// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TTThink } from '../../models/TTThink';
import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { observeKeyFocus } from '../../utils/keyFocus';
import { showMonacoMenu } from '../../utils/monacoMenu';
import { AppLayout } from './AppLayout';

vi.mock('@monaco-editor/react', () => ({ default: () => <textarea /> }));
vi.mock('../WorkingPanel/media/LazyTextEditorMedia', () => import('../WorkingPanel/media/TextEditorMedia'));
vi.mock('../WorkingPanel/media/monacoSetup', () => ({}));
vi.mock('react-force-graph-2d', () => ({ default: () => null }));

afterEach(() => {
  TTApplication.resetInstance();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('reports the editor in both a Project and a Working pane through the public Status IDs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const app = TTApplication.Instance;
  const manager = TTUIStateManager.instance;
  manager.init(app);
  const project = new TTThink();
  project.ID = '2026-11-28-100000';
  project.ContentType = 'project';
  project.Content = '計画A\n=';
  project.markSaved();
  app.Models.Vault.AddItem(project);
  app.ThinktankPanel.OpenProject(project.ID);
  app.ThinktankPanel.IsAreaOpen = true;
  app.ThinktankPanel.SetViewMode('project');
  const pane = app.WorkingPanel.AddToRight(project.ID, 'texteditor', '計画A');
  app.WorkingPanel.IsAreaOpen = true;
  app.WorkingPanel.SetViewMode('panes');
  app.WorkingPanel.ToolBarMode = 'Status';
  app.WorkingPanel.StatusModeText = 'Thinktank.KeyFocused.Panel,Thinktank.KeyFocused.SubPanel,Thinktank.KeyFocused.UIComponent';
  app.SeedsPanel.IsAreaOpen = true;
  app.SeedsPanel.SetViewMode('filter');
  app.HarvestPanel.IsAreaOpen = true;
  app.HarvestPanel.SetViewMode('aichat');

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const notify = vi.fn((keys: string[]) => manager.notifyConstPropertiesChanged(keys));
  const stop = observeKeyFocus(notify);
  const status = () => ['Panel', 'SubPanel', 'UIComponent'].map(field => manager.getProperty('Thinktank.KeyFocused.' + field));
  try {
    await act(async () => root.render(<AppLayout />));
    const editor = (panel: string) => host.querySelector<HTMLTextAreaElement>(`[data-key-panel="${panel}"] .text-editor-media textarea`);
    await vi.waitFor(() => expect(editor('Thinktank') && editor('Working')).toBeTruthy());
    await act(async () => editor('Thinktank')!.focus());
    expect(status()).toEqual(['Thinktank', 'Project', 'TextEditor']);
    await act(async () => editor('Working')!.focus());
    expect(status()).toEqual(['Working', '計画A', 'TextEditor']);
    expect(host.querySelector('.ApplicationStatusBarArea__status-text')?.textContent)
      .toContain('Thinktank.KeyFocused.SubPanel:[計画A] Thinktank.KeyFocused.UIComponent:[TextEditor]');

    await act(async () => {
      pane.Title = '更新, A';
      app.WorkingPanel.NotifyUpdated();
    });
    expect(status()).toEqual(['Working', '更新, A', 'TextEditor']);
    expect(notify).toHaveBeenLastCalledWith(['Thinktank.KeyFocused.SubPanel']);

    await act(async () => {
      const menu = showMonacoMenu({ title: '操作', nodes: [], anchor: editor('Working') });
      expect(status()).toEqual(['Working', '更新, A', 'Menu']);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await menu;
    });
    expect(status()[2]).toBe('TextEditor');
    await act(async () => editor('Working')!.blur());
    expect(status()).toEqual(['None', 'None', 'None']);
    // Merely focusing a tab must report the selected subpanel, even when the tab is for another view.
    const cases = [
      ['.seeds-panel .unified-filter-text-input', 'Seeds', 'Filer', 'ThinkFiler'],
      ['.vertical-tab-bar--working #TextEditor', 'WorkingSetting', 'PaneConfig', 'None'],
      ['#HarvestAIView', 'Harvest', 'AIChat', 'None'],
      ['.ApplicationStatusBarArea__panel-display-mode-btn', 'ToolBar', 'Status', 'None'],
    ];
    for (const [selector, panel, subpanel, component] of cases) {
      const control = host.querySelector<HTMLElement>(selector);
      expect(control, selector).toBeTruthy();
      await act(async () => control!.focus());
      expect(status()).toEqual([panel, subpanel, component]);
    }
  } finally {
    stop();
    await act(async () => root.unmount());
    host.remove();
  }
});
