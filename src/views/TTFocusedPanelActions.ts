/**
 * TTFocusedPanelActions.ts
 * FocusedPanel 系 TTAction の登録。
 *
 * app.FocusedColumn が示すパネルに対して
 * ToggleAreaVisibility / SetViewModePrev / SetViewModeNext を実行する。
 *
 * 呼び出し: App.tsx の初期化フローで registerFocusedPanelActions(app) を呼ぶ。
 */

import type { TTApplication } from './TTApplication';
import { TTActions } from './TTActions';

// ── パネルごとの ViewMode 順序定義 ───────────────────────────────────────────

const PANEL_VIEW_MODES: Record<string, string[]> = {
  Thinktank:      ['filter', 'chat', 'settings'],
  Overview:       ['datagrid', 'graph', 'chat', 'settings'],
  WorkoutSetting: ['workout', 'texteditor', 'markdown', 'datagrid', 'card', 'graph'],
  ReThink:        ['chat', 'settings'],
};

// ── 共通ヘルパー ─────────────────────────────────────────────────────────────

type PanelLike = {
  ToggleArea():            void;
  IsAreaOpen:              boolean;
  ViewMode:                string;
  SetViewMode(mode: any):  void;
};

function getPanel(app: TTApplication): PanelLike | null {
  switch (app.FocusedColumn) {
    case 'Thinktank':      return app.ThinktankPanel;
    case 'Overview':       return app.OverviewPanel;
    case 'WorkoutSetting': return app.WorkoutPanel;
    case 'ReThink':        return app.ReThinkPanel;
    default:               return null;
  }
}

// ── 登録 ─────────────────────────────────────────────────────────────────────

export function registerFocusedPanelActions(app: TTApplication): void {

  TTActions.Register({
    ActionID: 'FocusedPanel.ToggleAreaVisibility',
    Completion: (item) => {
      const panel = getPanel(app);
      if (!panel) { item.Result = '[対象なし]'; return; }
      panel.ToggleArea();
      item.Result = panel.IsAreaOpen ? '開いた' : '閉じた';
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.SetViewModePrev',
    Completion: (item) => {
      const panel = getPanel(app);
      const modes = PANEL_VIEW_MODES[app.FocusedColumn];
      if (!panel || !modes) { item.Result = '[対象なし]'; return; }
      const idx  = modes.indexOf(panel.ViewMode);
      const prev = modes[(idx - 1 + modes.length) % modes.length];
      panel.SetViewMode(prev);
      item.Result = prev;
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.SetViewModeNext',
    Completion: (item) => {
      const panel = getPanel(app);
      const modes = PANEL_VIEW_MODES[app.FocusedColumn];
      if (!panel || !modes) { item.Result = '[対象なし]'; return; }
      const idx  = modes.indexOf(panel.ViewMode);
      const next = modes[(idx + 1) % modes.length];
      panel.SetViewMode(next);
      item.Result = next;
    },
  });
}
