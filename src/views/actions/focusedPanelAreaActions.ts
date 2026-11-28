/**
 * focusedPanelAreaActions.ts
 * フォーカス中パネルのエリア開閉・幅モード・表示モード、ToolBar のモード切替のアクション。
 *
 * registerFocusedPanelActions（views/TTFocusedPanelActions.ts）から登録順どおりに呼ばれる。
 */

import type { TTApplication } from '../TTApplication';
import type { TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { getFocusName } from '../../utils/getFocusName';
import { TTUIStateManager, type ConfigKey } from '../TTUIStateManager';
import type { AreaWidthMode } from '../../utils/panelAreaWidth';
import { setPanelSectionsAll, isAnyPanelSectionOpen, type SectionsPanelId } from '../../hooks/usePanelSectionsSetAll';

// ── パネルごとの ViewMode 順序定義 ───────────────────────────────────────────

const PANEL_VIEW_MODES: Record<string, string[]> = {
  Thinktank: ['filter', 'project', 'aiview', 'aichat', 'settings'],
  Seeds: ['filter', 'project', 'aiview', 'aichat', 'settings'],
  WorkingSetting: ['panes', 'aiview', 'aichat', 'texteditor', 'chatsetting', 'markdown', 'datagrid', 'card', 'graph'],
  Working: ['panes', 'aiview', 'aichat', 'texteditor', 'chatsetting', 'markdown', 'datagrid', 'card', 'graph'],
  Harvest: ['aiview', 'aichat', 'settings'],
};

/** フォーカス列 → 開閉セクションの一括操作で使うパネルID（Working は2列とも設定エリアを指す） */
const SECTIONS_PANEL_IDS: Record<string, SectionsPanelId> = {
  Thinktank: 'thinktank',
  Seeds: 'seeds',
  WorkingSetting: 'working',
  Working: 'working',
  Harvest: 'harvest',
};

// ── 共通ヘルパー ─────────────────────────────────────────────────────────────

type PanelLike = {
  ToggleArea(): void;
  IsAreaOpen: boolean;
  ViewMode: string;
  SetViewMode(mode: any): void;
};

function getPanel(app: TTApplication, column: string = app.FocusedColumn): PanelLike | null {
  switch (column) {
    case 'Thinktank': return app.ThinktankPanel;
    case 'Seeds': return app.SeedsPanel;
    case 'WorkingSetting':
    case 'Working': return app.WorkingPanel;
    case 'Harvest': return app.HarvestPanel;
    default: return null;
  }
}

export function registerFocusedPanelAreaActions(app: TTApplication): void {
  // ── フォーカスパネルの Area 表示幅 ─────────────────────────────────────────
  // 幅そのものではなくモード（init/user/foredit）を切り替える。px の導出は
  // utils/panelAreaWidth.ts が担い、foredit はアプリ幅から毎回計算する。

  /** フォーカス列 → 幅モードを持つ Status キー（Working は Pane 側の列も設定パネルを指す） */
  const AREA_WIDTH_KEYS: Record<string, ConfigKey> = {
    Thinktank: 'ThinktankPanel.Area.OpenWidth',
    Seeds: 'SeedsPanel.Area.OpenWidth',
    WorkingSetting: 'WorkingSettingPanel.Area.OpenWidth',
    Working: 'WorkingSettingPanel.Area.OpenWidth',
    Harvest: 'HarvestPanel.Area.OpenWidth',
  };

  const setFocusedAreaWidth = (item: TTActionItem, value: string): void => {
    const key = AREA_WIDTH_KEYS[app.FocusedColumn];
    if (!key) { item.Result = '[対象なし]'; return; }
    TTUIStateManager.instance.applyProperty(key, value);
    item.Result = TTUIStateManager.instance.getProperty(key);
  };

  /** 幅モードを持つ Status キーの一覧（Working は2列が同じキーを指すので重複を除く） */
  const ALL_AREA_WIDTH_KEYS = [...new Set(Object.values(AREA_WIDTH_KEYS))];

  /**
   * except 以外で foredit のパネルを user に戻す。
   * foredit はアプリ幅の割合を占めるので、同時に複数のパネルが foredit だと画面が破綻する。
   */
  const demoteOtherForEditPanels = (except: ConfigKey): string[] => {
    const demoted: string[] = [];
    for (const key of ALL_AREA_WIDTH_KEYS) {
      if (key === except) continue;
      if (TTUIStateManager.instance.getProperty(key) !== 'foredit') continue;
      TTUIStateManager.instance.applyProperty(key, 'user');
      demoted.push(key.split('.')[0]);
    }
    return demoted;
  };

  // ── エリア開閉（開くときの幅を指定する）────────────────────────────────
  // 閉じるときは幅モードを触らない。次に開いたときの幅は、そのとき押した
  // アクション（Toggle=user / ToggleForEdit=foredit）が決める。

  const registerAreaToggle = (suffix: string, width: AreaWidthMode, label: string): void => {
    TTActions.Register({
      ActionID: `FocusedPanel.Area.IsOpen:${suffix}`,
      Description: `フォーカスパネルのエリア開閉を${label}位置でトグルする`,
      Completion: (item) => {
        const panel = getPanel(app);
        if (!panel) { item.Result = '[対象なし]'; return; }
        panel.ToggleArea();
        if (!panel.IsAreaOpen) { item.Result = '閉じた'; return; }
        const key = AREA_WIDTH_KEYS[app.FocusedColumn];
        if (key) TTUIStateManager.instance.applyProperty(key, width);
        // foredit で開くときは、他に foredit のパネルが残らないようにする
        const demoted = key && width === 'foredit' ? demoteOtherForEditPanels(key) : [];
        item.Result = `開いた（${label}）${demoted.length ? ` ／ ${demoted.join('・')}をUserに戻した` : ''}`;
      },
    });
  };
  registerAreaToggle('Toggle', 'user', 'User');
  registerAreaToggle('ToggleForEdit', 'foredit', 'ForEdit');

  // ── エリアの段階的な開閉 ───────────────────────────────────────────────
  // 開: エリアが閉じていれば開くだけ。開いていれば下位項目をすべて開く。
  // 閉: 下位項目が1つでも開いていればすべて閉じるだけ。無ければエリアを閉じる。
  // トグルボタンの Shift+右クリックはボタンへフォーカスを移してから呼ぶので、
  // FocusedColumn（focusin→rAF で遅れて更新）ではなく今のフォーカスから対象を決める。

  const stepwiseTarget = (): { panel: PanelLike; sectionsId: SectionsPanelId } | null => {
    const live = getFocusName(document.activeElement).split('.')[0];
    const column = live && live !== 'None' ? live : app.FocusedColumn;
    const panel = getPanel(app, column);
    const sectionsId = SECTIONS_PANEL_IDS[column];
    return panel && sectionsId ? { panel, sectionsId } : null;
  };

  TTActions.Register({
    ActionID: 'FocusedPanel.Area.OpenStepwise',
    Description: 'フォーカスパネルのエリアを段階的に開く',
    Completion: (item) => {
      const target = stepwiseTarget();
      if (!target) { item.Result = '[対象なし]'; return; }
      if (!target.panel.IsAreaOpen) {
        target.panel.ToggleArea();
        item.Result = 'エリアを開いた';
        return;
      }
      setPanelSectionsAll(target.sectionsId, true);
      item.Result = '下位項目をすべて開いた';
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.Area.CloseStepwise',
    Description: 'フォーカスパネルのエリアを段階的に閉じる',
    Completion: (item) => {
      const target = stepwiseTarget();
      if (!target) { item.Result = '[対象なし]'; return; }
      if (!target.panel.IsAreaOpen) { item.Result = '[閉じている]'; return; }
      if (isAnyPanelSectionOpen(target.sectionsId)) {
        setPanelSectionsAll(target.sectionsId, false);
        item.Result = '下位項目をすべて閉じた';
        return;
      }
      target.panel.ToggleArea();
      item.Result = 'エリアを閉じた';
    },
  });

  for (const [suffix, value, label] of [
    ['Initial', 'init', '初期値'],
    ['User', 'user', 'ユーザー設定値'],
    ['ForEdit', 'foredit', '編集時の値'],
  ] as const) {
    TTActions.Register({
      ActionID: `FocusedPanel.Area.OpenWidth:${suffix}`,
      Description: `フォーカスパネルOpen時の幅を${label}にする`,
      Completion: (item) => setFocusedAreaWidth(item, value),
    });
  }

  TTActions.Register({
    ActionID: 'FocusedPanel.Area.OpenWidth:Toggle',
    Description: 'フォーカスパネルOpen時の幅をUser/ForEditでtoggleする',
    Completion: (item) => {
      const key = AREA_WIDTH_KEYS[app.FocusedColumn];
      if (!key) { item.Result = '[対象なし]'; return; }
      // init から押されたときは、まず広げる側（foredit）に倒す
      const next = TTUIStateManager.instance.getProperty(key) === 'foredit' ? 'user' : 'foredit';
      setFocusedAreaWidth(item, next);
    },
  });

  TTActions.Register({
    ActionID: 'FocusedPanel.Mode.Name:Prev',
    Description: 'フォーカスパネルの表示モードを前に切り替える',
    Completion: (item) => {
      const panel = getPanel(app);
      const modes = PANEL_VIEW_MODES[app.FocusedColumn];
      if (!panel || !modes) { item.Result = '[対象なし]'; return; }
      const idx = modes.indexOf(panel.ViewMode);
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
      const idx = modes.indexOf(panel.ViewMode);
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
}
