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
import type { ActionID, TTActionItem } from './TTAction';
import type { TTThink } from '../models/TTThink';
import { TTActions } from './TTActions';
import { TTShortcutManager } from './TTShortcutManager';
import { TTUIStateManager, type ConfigKey } from './TTUIStateManager';
import { ZOOM_DEFAULT, ZOOM_STEP } from '../utils/appZoom';
import { apiFetch } from '../services/apiClient';
import { showMonacoMenu } from '../utils/monacoMenu';
import { collectAreaIds } from './TTWorkoutPanel';
import { registerTextEditorDateActions } from './actions/textEditorDateActions';
import { registerTextEditorBulletActions, registerTextEditorCommentActions } from './actions/textEditorStyleActions';
import { registerTextEditorFoldingHeadingActions } from './actions/textEditorFoldingActions';
import { registerTextEditorHeadingNavActions } from './actions/textEditorHeadingNavActions';
import { registerTextEditorCurrentFoldingActions } from './actions/textEditorCurrentFoldingActions';
import { registerTextEditorCursorMoveActions } from './actions/textEditorCursorMoveActions';
import { registerTextEditorHighlighterToolbarActions } from './actions/textEditorHighlighterToolbarActions';
import { registerTextEditorCursorContentActions } from './actions/textEditorCursorContentActions';
import { registerTextEditorKeyBindingActions } from './actions/textEditorKeyBindingActions';
import { registerTextEditorColorBindingActions } from './actions/textEditorColorBindingActions';

// ── パネルごとの ViewMode 順序定義 ───────────────────────────────────────────

const PANEL_VIEW_MODES: Record<string, string[]> = {
  Thinktank:      ['filter', 'chat', 'settings'],
  Overview:       ['filter', 'graph', 'chat', 'settings'],
  WorkoutSetting: ['workout', 'texteditor', 'markdown', 'datagrid', 'card', 'graph', 'chat'],
  Workout:        ['workout', 'texteditor', 'markdown', 'datagrid', 'card', 'graph'],
  ReThink:        ['chat', 'settings'],
};

// ── 共通ヘルパー ─────────────────────────────────────────────────────────────

type PanelLike = {
  ToggleArea():            void;
  IsAreaOpen:              boolean;
  ViewMode:                string;
  SetViewMode(mode: any):  void;
};

/** Think一覧のカーソルアクションが必要とするパネルの最小インターフェース */
type FilterCursorPanel = {
  CurrentItemID:       string;
  FilteredThoughts:    TTThink[];
  CheckedThoughtIDs:   string[];
  ToggleCheck(id: string | string[], forceChecked?: boolean): void;
};

/** Think一覧を持つパネル（Thinktank / Overview）ごとのアクション生成定義 */
type FilterPanelSpec = {
  prefix:         'ThinktankPanel' | 'OverviewPanel';
  panelOf:        () => FilterCursorPanel;
  currentItemKey: string;
  open:           (id: string) => void;
};

function getPanel(app: TTApplication): PanelLike | null {
  switch (app.FocusedColumn) {
    case 'Thinktank':      return app.ThinktankPanel;
    case 'Overview':       return app.OverviewPanel;
    case 'WorkoutSetting':
    case 'Workout':        return app.WorkoutPanel;
    case 'ReThink':        return app.ReThinkPanel;
    default:               return null;
  }
}

// ── 登録 ─────────────────────────────────────────────────────────────────────

export function registerFocusedPanelActions(app: TTApplication): void {

  TTActions.Register({
    ActionID: 'FocusedPanel.Area.IsOpen:Toggle',
    Description: 'フォーカスパネルのエリア開閉をトグルする',
    Completion: (item) => {
      const panel = getPanel(app);
      if (!panel) { item.Result = '[対象なし]'; return; }
      panel.ToggleArea();
      item.Result = panel.IsAreaOpen ? '開いた' : '閉じた';
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.Mode.Name:Prev',
    Description: 'フォーカスパネルの表示モードを前に切り替える',
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
    ActionID: 'FocusedPanel.Mode.Name:Next',
    Description: 'フォーカスパネルの表示モードを次に切り替える',
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

  TTActions.Register({
    ActionID: 'ToolBar.Mode.Name:Next',
    Description: 'ToolBarのモードを次の値に切り替える（循環）',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('ToolBar.Mode.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('ToolBar.Mode.Name');
    },
  });

  TTActions.Register({
    ActionID: 'ToolBar.Mode.Name:Prev',
    Description: 'ToolBarのモードを前の値に切り替える（循環）',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('ToolBar.Mode.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('ToolBar.Mode.Name');
    },
  });

  // ── Think一覧 カーソル アクション ──────────────────────────────────────
  /** Think一覧を持つパネルごとの定義（Thinktank / Overview で共通のアクションを生成する） */
  const FILTER_PANELS: FilterPanelSpec[] = [
    {
      prefix:         'ThinktankPanel',
      panelOf:        () => app.ThinktankPanel,
      currentItemKey: 'ThinktankPanel.CurrentItem.ID',
      // Bundle はその場で Overview へ、それ以外は Workout へ（一覧ダブルクリックと同じ挙動）
      open: (id) => {
        if (app.Models.Vault.GetThink(id)?.ContentType === 'bundle') {
          app.OpenBundle(id, 'datagrid');
        } else {
          app.OpenThinkInWorkout(id);
        }
      },
    },
    {
      prefix:         'OverviewPanel',
      panelOf:        () => app.OverviewPanel,
      currentItemKey: 'OverviewPanel.CurrentItem.ID',
      open: (id) => { app.OpenThinkInWorkout(id); },
    },
  ];

  /** カーソル位置の変化を Status へ通知する */
  const notifyCursor = (spec: FilterPanelSpec): void => {
    TTUIStateManager.instance.notifyPropertyChanged(spec.currentItemKey);
    TTUIStateManager.instance.notifyConstPropertyChanged(`${spec.prefix}.Filter.CursorPos`);
    TTUIStateManager.instance.notifyConstPropertyChanged(`${spec.prefix}.Filter.CursorPosID`);
  };

  /** カーソル位置のThinkを返す（一覧が空 / カーソルなしの場合は null） */
  const cursorThink = (spec: FilterPanelSpec): TTThink | null => {
    const panel = spec.panelOf();
    if (!panel.CurrentItemID) return null;
    return panel.FilteredThoughts.find(t => t.ID === panel.CurrentItemID) ?? null;
  };

  for (const spec of FILTER_PANELS) {
    for (const [suffix, dir] of [['PrevLine', -1], ['NextLine', 1]] as const) {
      TTActions.Register({
        ActionID: `${spec.prefix}.Filter.CursorPos:${suffix}` as ActionID,
        Description: `${spec.prefix}>Think一覧のカーソルを${suffix === 'PrevLine' ? '1行前' : '1行後'}に移動する`,
        Completion: (item) => {
          const panel = spec.panelOf();
          const list = panel.FilteredThoughts;
          if (list.length === 0) { item.Result = '[一覧なし]'; return; }
          const curIdx = panel.CurrentItemID
            ? list.findIndex(t => t.ID === panel.CurrentItemID)
            : -1;
          // カーソル未表示（0行）からの移動は方向によらず先頭行へ
          const nextIdx = curIdx < 0
            ? 0
            : Math.max(0, Math.min(curIdx + dir, list.length - 1));
          panel.CurrentItemID = list[nextIdx].ID;
          notifyCursor(spec);
          item.Result = `行${nextIdx + 1}: ${list[nextIdx].Name || list[nextIdx].ID}`;
        },
      });
    }

    TTActions.Register({
      ActionID: `${spec.prefix}.Filter.Cursor:Action` as ActionID,
      Description: `${spec.prefix}>Think一覧のカーソル位置のアイテムを開く`,
      Completion: (item) => {
        const think = cursorThink(spec);
        if (!think) { item.Result = '[カーソルなし]'; return; }
        spec.open(think.ID);
        item.Result = `開く: ${think.Name || think.ID}`;
      },
    });

    TTActions.Register({
      ActionID: `${spec.prefix}.Filter.Cursor:ToggleCheck` as ActionID,
      Description: `${spec.prefix}>Think一覧のカーソル位置のチェック状態をトグルする`,
      Completion: (item) => {
        const think = cursorThink(spec);
        if (!think) { item.Result = '[カーソルなし]'; return; }
        const panel = spec.panelOf();
        panel.ToggleCheck(think.ID);
        const checked = panel.CheckedThoughtIDs.includes(think.ID);
        item.Result = `${checked ? 'チェック' : 'チェック解除'}: ${think.Name || think.ID}`;
      },
    });
  }

  // ExMode 関連アクションの登録（'Application.Status.ExMode:xxx' と 'ExMode:xxx' の
  // 2つのActionID表記がショートカット定義側で使われるため、両方を同じハンドラに解決させる）
  const registerExModeAction = (mode: string): void => {
    const completion = (item: TTActionItem) => {
      app.Status.SetExMode(mode, item.Mods ?? '');
      item.Result = `ExMode→${mode} [${item.Mods ?? ''}]`;
    };
    const description = `拡張モードを${mode}に設定する`;
    TTActions.Register({ ActionID: `Application.Status.ExMode:${mode}`, Description: description, Completion: completion });
    TTActions.Register({ ActionID: `ExMode:${mode}`, Description: description, Completion: completion });
  };
  registerExModeAction('ExApp');
  registerExModeAction('ExOpt');
  registerExModeAction('None');

  // UI状態 (Undo/Redo) アクションの登録
  TTActions.Register({
    ActionID: 'TextEditor.EditText.Undo',
    Description: '編集を元に戻す（Undo）',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'undo', {});
        item.Result = 'Editor Undo';
      } else {
        TTUIStateManager.instance.undo();
        item.Result = 'UI State Undo';
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.EditText.Redo',
    Description: '編集をやり直す（Redo）',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'redo', {});
        item.Result = 'Editor Redo';
      } else {
        TTUIStateManager.instance.redo();
        item.Result = 'UI State Redo';
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.EditText.Delete',
    Description: 'カーソル右の文字を削除する',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'deleteRight', {});
        item.Result = 'Editor Delete';
      }
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.EditText.Backspace',
    Description: 'カーソル左の文字を削除する',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (editor && isEditorFocused) {
        editor.trigger('keyboard', 'deleteLeft', {});
        item.Result = 'Editor Backspace';
      }
    },
  });

  // 状態変数 (Property) 変更アクションの登録
  TTActions.Register({
    ActionID: 'Application.FocusedArea.Name:prev',
    Description: 'フォーカスエリアを前に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedArea.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedArea.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedArea.Name:next',
    Description: 'フォーカスエリアを次に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedArea.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedArea.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedPanel.Name:Prev',
    Description: 'フォーカスカラムを前のパネルに移動する',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedPanel.Name', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedPanel.Name');
    },
  });

  TTActions.Register({
    ActionID: 'Application.FocusedPanel.Name:Next',
    Description: 'フォーカスカラムを次のパネルに移動する',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.FocusedPanel.Name', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.FocusedPanel.Name');
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.PaneNumber:Next',
    Description: 'フォーカスペインを次のペインに移動する',
    Completion: (item) => {
      const wPanel = app.WorkoutPanel;
      const layout = wPanel.Layout;
      if (!layout) { item.Result = '[レイアウトなし]'; return; }
      const order = collectAreaIds(layout);
      if (order.length <= 1) { item.Result = '[ペイン数不足]'; return; }

      const curIdx = wPanel.FocusedAreaId ? order.indexOf(wPanel.FocusedAreaId) : -1;
      const nextIdx = curIdx >= 0 ? (curIdx + 1) % order.length : 0;
      const nextAreaId = order[nextIdx];

      wPanel.FocusArea(nextAreaId);
      item.Result = `Pane ${nextIdx + 1}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.PaneNumber:Prev',
    Description: 'フォーカスペインを前のペインに移動する',
    Completion: (item) => {
      const wPanel = app.WorkoutPanel;
      const layout = wPanel.Layout;
      if (!layout) { item.Result = '[レイアウトなし]'; return; }
      const order = collectAreaIds(layout);
      if (order.length <= 1) { item.Result = '[ペイン数不足]'; return; }

      const curIdx = wPanel.FocusedAreaId ? order.indexOf(wPanel.FocusedAreaId) : -1;
      const prevIdx = curIdx >= 0 ? (curIdx - 1 + order.length) % order.length : order.length - 1;
      const prevAreaId = order[prevIdx];

      wPanel.FocusArea(prevAreaId);
      item.Result = `Pane ${prevIdx + 1}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.PaneNumber:ReFocus',
    Description: 'WorkoutPanelの現在フォーカス中のPaneに再度フォーカスする',
    Completion: (item) => {
      const wPanel = app.WorkoutPanel;
      const areaId = wPanel.FocusedAreaId;
      if (!areaId) { item.Result = '[対象Paneなし]'; return; }

      // FocusArea() は同一ID指定時 no-op のため、WorkoutArea側の
      // フォーカス適用エフェクト（isFocused: false→true の変化）を
      // 強制的に再発火させるため、一度 null にしてから次のマクロタスクで再設定する
      // （同一タスク内での再設定は React のバッチ処理により変化なしと扱われるため効かない）
      wPanel.FocusedAreaId = null;
      wPanel.NotifyUpdated();
      setTimeout(() => {
        wPanel.FocusArea(areaId);
      }, 0);
      item.Result = 'Paneに再フォーカスしました';
    },
  });

  // ── Pane毎のLoadファイル履歴 ───────────────────────────────────────────
  /** フォーカスされているPane（WorkoutArea）を返す */
  const focusedArea = () => {
    const id = app.WorkoutPanel.FocusedAreaId;
    return id ? (app.WorkoutPanel.GetArea(id) ?? null) : null;
  };

  const notifyFileHistory = (): void => {
    TTUIStateManager.instance.notifyConstPropertyChanged('WorkoutPanel.FocusedPane.FileHistory');
    TTUIStateManager.instance.notifyConstPropertyChanged('WorkoutPanel.FocusedPane.FileHistoryPos');
    TTUIStateManager.instance.notifyConstPropertyChanged('WorkoutPanel.FocusedPane.FileHistoryMax');
  };

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.FileHistory:Next',
    Description: 'フォーカスペインのファイル履歴を1つ後の位置に進める',
    Completion: (item) => {
      const area = focusedArea();
      if (!area) { item.Result = '[対象Paneなし]'; return; }
      // 末尾位置には進む先のIDが無いため、HistoryMaxが上限(30)か否かに関わらずロードしない
      if (area.HistoryPos >= area.HistoryMax) { item.Result = '[履歴の末尾]'; return; }
      const entry = area.LoadHistoryAt(area.HistoryPos + 1);
      if (!entry) { item.Result = '[履歴なし]'; return; }
      notifyFileHistory();
      item.Result = `履歴 ${area.HistoryPos}/${area.HistoryMax}: ${entry.title || entry.id}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.FileHistory:Prev',
    Description: 'フォーカスペインのファイル履歴を1つ前の位置に戻す',
    Completion: (item) => {
      const area = focusedArea();
      if (!area) { item.Result = '[対象Paneなし]'; return; }
      if (area.HistoryPos <= 1) { item.Result = '[履歴の先頭]'; return; }
      const entry = area.LoadHistoryAt(area.HistoryPos - 1);
      if (!entry) { item.Result = '[履歴なし]'; return; }
      notifyFileHistory();
      item.Result = `履歴 ${area.HistoryPos}/${area.HistoryMax}: ${entry.title || entry.id}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.FileHistory:Menu',
    Description: 'フォーカスペインのファイル履歴をメニューで表示して選択する',
    Completion: (item) => {
      const area = focusedArea();
      if (!area) { item.Result = '[対象Paneなし]'; return; }
      if (area.HistoryMax === 0) { item.Result = '[履歴なし]'; return; }

      // 古いもの順（履歴の並び順そのまま）。1〜9番目はニーモニック（数字キー）で直接決定できる
      const nodes = area.FileHistory.map((entry, idx) => {
        const pos = idx + 1;
        return {
          key:    String(pos),
          label:  `${pos === area.HistoryPos ? '● ' : ''}${entry.title || entry.id}`,
          detail: entry.id,
          value:  String(pos),
        };
      });

      const anchor = document.querySelector<HTMLElement>(`.workout-area[data-area-id="${area.ID}"]`);
      return showMonacoMenu({ title: 'ファイル履歴', nodes, anchor }).then(value => {
        if (!value) { item.Result = 'メニューの選択をキャンセルしました'; return; }
        const entry = area.LoadHistoryAt(Number(value));
        if (!entry) { item.Result = '[履歴なし]'; return; }
        notifyFileHistory();
        item.Result = `履歴 ${area.HistoryPos}/${area.HistoryMax}: ${entry.title || entry.id}`;
      });
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.Mode:Next',
    Description: 'フォーカスペインの表示モードを次に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('WorkoutPanel.FocusedPane.Mode', 'next');
      item.Result = TTUIStateManager.instance.getProperty('WorkoutPanel.FocusedPane.Mode');
    },
  });

  TTActions.Register({
    ActionID: 'WorkoutPanel.FocusedPane.Mode:Prev',
    Description: 'フォーカスペインの表示モードを前に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('WorkoutPanel.FocusedPane.Mode', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('WorkoutPanel.FocusedPane.Mode');
    },
  });

  // PanelDisplay Mode
  TTActions.Register({
    ActionID: 'Application.PanelDisplay.Mode:Normal',
    Description: 'パネル表示モードをNormalにする',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.PanelDisplay.Mode', 'Normal');
      item.Result = 'Normal';
    },
  });
  TTActions.Register({
    ActionID: 'Application.PanelDisplay.Mode:Simple',
    Description: 'パネル表示モードをSimpleにする',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.PanelDisplay.Mode', 'Simple');
      item.Result = 'Simple';
    },
  });

  // Display Zoom（表示文字サイズの拡大表示 / 縮小表示）
  const stepAppZoom = (item: TTActionItem, deltaSign: 1 | -1): void => {
    const current = parseInt(TTUIStateManager.instance.getProperty('Application.Display.Zoom'), 10) || ZOOM_DEFAULT;
    const next = current + deltaSign * ZOOM_STEP;
    TTUIStateManager.instance.applyProperty('Application.Display.Zoom', String(next));
    item.Result = `${TTUIStateManager.instance.getProperty('Application.Display.Zoom')}%`;
  };
  TTActions.Register({
    ActionID: 'Application.Display.Zoom:ZoomIn',
    Description: '拡大表示',
    Completion: (item) => stepAppZoom(item, 1),
  });
  TTActions.Register({
    ActionID: 'Application.Display.Zoom:ZoomOut',
    Description: '縮小表示',
    Completion: (item) => stepAppZoom(item, -1),
  });

  // IsVisible 系トグル（LineNumbers/WordWrap/Minimap は TTShortcutManager の DEFAULT_SHORTCUTS が
  // 小文字 `:toggle` で参照するため、大文字小文字どちらの ActionID でも同じハンドラに解決させる）
  const registerToggleAction = (actionId: ActionID, key: ConfigKey, description: string): void => {
    TTActions.Register({
      ActionID: actionId,
      Description: description,
      Completion: (item) => {
        TTUIStateManager.instance.applyProperty(key, 'toggle');
        item.Result = TTUIStateManager.instance.getProperty(key);
      },
    });
  };
  const IS_VISIBLE_TOGGLE_KEYS: Array<[ConfigKey, string]> = [
    ['TextEditor.LineNumbers.IsVisible',              '行番号表示をトグルする'],
    ['TextEditor.WordWrap.IsVisible',                 '折り返し表示をトグルする'],
    ['TextEditor.Minimap.IsVisible',                  'ミニマップ表示をトグルする'],
    ['TextEditor.FullWidthSpace.IsVisible',            '全角スペース強調表示をトグルする'],
    ['TextEditor.UnicodeHighlight.IsVisible',          'Unicode文字強調表示をトグルする'],
    ['TextEditor.BracketPairColorization.IsVisible',   '括弧の色分けをトグルする'],
  ];
  for (const [key, description] of IS_VISIBLE_TOGGLE_KEYS) {
    registerToggleAction(`${key}:Toggle`, key, description);
    registerToggleAction(`${key}:toggle`, key, description);
  }

  // ── Editor 検索・置換 ─────────────────────────────────────────────────────
  /** Monaco既定の検索/置換ウィジェットのコントローラーを取得する */
  const getFindController = (editor: any): any =>
    editor.getContribution?.('editor.contrib.findController') as any;

  /** 現在保存されている検索・置換オプションを、開いているMonaco既定の検索/置換ウィジェットへ反映する */
  const applyFindOptionsToController = (editor: any): void => {
    const state = getFindController(editor)?.getState?.();
    if (!state) return;
    const findOpt = app.WorkoutPanel.TextEditor.FindOption;
    const replaceOpt = app.WorkoutPanel.TextEditor.ReplaceOption;
    state.change({
      matchCase: findOpt.MatchCase,
      wholeWord: findOpt.MatchWholeWord,
      isRegex: findOpt.UseRexp,
      preserveCase: replaceOpt.PreserveCase,
    }, false);
  };

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.ShowFind',
    Description: '検索ダイアログを表示/非表示トグルする',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) {
        item.Result = '[エディタ未選択]';
        return;
      }
      const controller = getFindController(editor);
      const state = controller?.getState?.();
      // 検索ダイアログ（置換行を伴わない）が表示中なら閉じて終了する
      if (state?.isRevealed && !state.isReplaceRevealed) {
        controller.closeFindWidget();
        item.Result = '検索ダイアログを閉じました';
        return;
      }
      editor.getAction('actions.find')?.run();
      applyFindOptionsToController(editor);
      item.Result = '検索ダイアログを表示しました';
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.ShowReplace',
    Description: '置換ダイアログを表示/非表示トグルする',
    Completion: (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      if (!editor) {
        item.Result = '[エディタ未選択]';
        return;
      }
      const controller = getFindController(editor);
      const state = controller?.getState?.();
      // 置換ダイアログ（置換行を伴う）が表示中なら閉じて終了する
      if (state?.isRevealed && state.isReplaceRevealed) {
        controller.closeFindWidget();
        item.Result = '置換ダイアログを閉じました';
        return;
      }
      editor.getAction('editor.action.startFindReplaceAction')?.run();
      applyFindOptionsToController(editor);
      item.Result = '置換ダイアログを表示しました';
    },
  });

  // FindOption / ReplaceOption Toggle（表示中の検索/置換ウィジェットがあれば即時反映する）
  const registerFindOptionToggle = (actionId: ActionID, key: ConfigKey, description: string): void => {
    TTActions.Register({
      ActionID: actionId,
      Description: description,
      Completion: (item) => {
        TTUIStateManager.instance.applyProperty(key, 'toggle');
        const editor = TTShortcutManager.instance.activeEditor;
        if (editor) applyFindOptionsToController(editor);
        item.Result = TTUIStateManager.instance.getProperty(key);
      },
    });
  };
  registerFindOptionToggle('TextEditor.FindOption.MatchCase:Toggle', 'TextEditor.FindOption.MatchCase', '検索オプション「大文字小文字を区別」をトグルする');
  registerFindOptionToggle('TextEditor.FindOption.MatchWholeWord:Toggle', 'TextEditor.FindOption.MatchWholeWord', '検索オプション「単語単位で検索」をトグルする');
  registerFindOptionToggle('TextEditor.FindOption.UseRexp:Toggle', 'TextEditor.FindOption.UseRexp', '検索オプション「正規表現」をトグルする');
  registerFindOptionToggle('TextEditor.ReplaceOption.PreserveCase:Toggle', 'TextEditor.ReplaceOption.PreserveCase', '置換オプション「大文字小文字を保持」をトグルする');

  // Dates
  TTActions.Register({
    ActionID: 'Application.Date:Next',
    Description: 'Application.Dateを次の値に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.Date', 'next');
      item.Result = TTUIStateManager.instance.getProperty('Application.Date');
    },
  });
  TTActions.Register({
    ActionID: 'Application.Date:Prev',
    Description: 'Application.Dateを前の値に切り替える',
    Completion: (item) => {
      TTUIStateManager.instance.applyProperty('Application.Date', 'prev');
      item.Result = TTUIStateManager.instance.getProperty('Application.Date');
    },
  });

  TTActions.Register({
    ActionID: 'Application.Resource.ExportToLocal',
    Description: 'BQ保存済みThinkファイルをローカルにエクスポートする',
    Completion: (item) => {
      const status = app.Status as any;
      if (status && typeof status.SetLocalExporting === 'function') {
        status.SetLocalExporting('0%');
      }

      const pollInterval = setInterval(async () => {
        try {
          const res = await apiFetch('/api/bq/files/export/status');
          if (res.ok) {
            const progress = await res.json() as { running: boolean; total: number; current: number };
            if (progress.total > 0 && status && typeof status.SetLocalExporting === 'function') {
              const pct = Math.round((progress.current / progress.total) * 100);
              status.SetLocalExporting(`${pct}%`);
            }
          }
        } catch (e) {
          console.error('Failed to poll export status:', e);
        }
      }, 300);

      return apiFetch('/api/bq/files/export', { method: 'POST' })
        .then(async (res) => {
          clearInterval(pollInterval);
          if (!res.ok) {
            throw new Error(`Export API failed: ${res.status}`);
          }
          const result = await res.json() as { success: boolean; count: number; path: string };
          if (status && typeof status.SetLocalExporting === 'function') {
            status.SetLocalExporting('100%');
          }
          item.Result = `保存完了: ${result.count}件を ${result.path} に保存しました`;
        })
        .catch((err) => {
          clearInterval(pollInterval);
          if (status && typeof status.SetLocalExporting === 'function') {
            status.SetLocalExporting('0%');
          }
          item.Result = `[エラー] ${err.message}`;
          throw err;
        });
    },
  });

  // ── 巻戻（BQ time travel による1時間前への復元）──────────────────────────
  // TODO: バックエンドに BigQuery time travel（FOR SYSTEM_TIME AS OF）を使う
  //       復元APIを新設し、下記2アクションの中身を実装する。
  //        - 単一Think:  直前にフォーカスされた file_id 1件のみを1時間前のレコードで上書き
  //          （対象は WorkoutPanel.FocusedPane.FileHistory の先頭）
  //        - BQ全体:     thinktank.vault 全体を1時間前のスナップショットで置換
  //       現状はUIの受け皿のみで、実行しても復元は行われない。
  TTActions.Register({
    ActionID: 'Application.Resource.RollbackFocusedThink',
    Description: '直前にフォーカスされたThinkファイル１つをBQで1時間前の状態に戻す',
    Completion: (item) => {
      const status = app.Status as any;
      const msg = '巻戻（Think1件）: 未実装です';
      if (status && typeof status.SetLastActionDisplay === 'function') {
        status.SetLastActionDisplay(msg);
      }
      item.Result = `[未実装] ${item.ActionID}`;
    },
  });
  TTActions.Register({
    ActionID: 'Application.Resource.RollbackAll',
    Description: 'BQ全体を1時間前の状態に戻す',
    Completion: (item) => {
      const status = app.Status as any;
      const msg = '巻戻（BQ全体）: 未実装です';
      if (status && typeof status.SetLastActionDisplay === 'function') {
        status.SetLastActionDisplay(msg);
      }
      item.Result = `[未実装] ${item.ActionID}`;
    },
  });

  registerTextEditorCursorMoveActions(app);
  registerTextEditorHighlighterToolbarActions(app);
  registerTextEditorCursorContentActions(app);
  registerTextEditorHeadingNavActions(app);
  registerTextEditorKeyBindingActions(app);
  registerTextEditorColorBindingActions(app);
  registerTextEditorCurrentFoldingActions(app);
  registerTextEditorDateActions(app);
  registerTextEditorBulletActions(app);
  registerTextEditorCommentActions(app);
  registerTextEditorFoldingHeadingActions(app);
}

// ── テキストエディタ専用のアクション登録 ──────────────────────────────────────────
// 見出し構造の解析（getHeadingLevel/getHeadingAttributes等）は utils/markdownHeadings.ts に
// 分離済み（TTUIStateManager.ts との循環importを解消するため）。

// TextEditor.CurrentEditor.CursorPos:* / DoOnCursorPos:* / WorkoutPanel.DroppedFile:* アクションは
// views/actions/textEditorCursorMoveActions.ts、textEditorHighlighterToolbarActions.ts、
// textEditorCursorContentActions.ts に分離済み。


