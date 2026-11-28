/**
 * TTFocusedPanelActions.ts
 * パネル・Pane・テキストエディタ系 TTAction の登録の入口。
 * 中身は views/actions/*.ts に分けてあり、ここでは決まった順に呼ぶだけにする。
 *
 * 呼び出し: App.tsx の初期化フローで registerFocusedPanelActions(app) を呼ぶ。
 */

import type { TTApplication } from './TTApplication';
import { UNAVAILABLE_ACTIONS } from './unavailableActions';
import { TTActions } from './TTActions';
import { TTUIStateManager } from './TTUIStateManager';
import { registerFocusedPanelAreaActions } from './actions/focusedPanelAreaActions';
import { registerThinkListActions } from './actions/thinkListActions';
import { registerApplicationStateActions } from './actions/applicationStateActions';
import { registerWorkingPaneActions } from './actions/workingPaneActions';
import { registerDisplayActions } from './actions/displayActions';
import { registerTextEditorFindActions } from './actions/textEditorFindActions';
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
import { registerTextEditorSearchTagActions } from './actions/textEditorSearchTagActions';
import { registerTextEditorDictionaryActions } from './actions/textEditorDictionaryActions';
import { registerTextEditorPasteActions } from './actions/textEditorPasteActions';

// 登録の順番に意味がある（同じ ActionID は後の登録が勝ち、一覧は最初に登録した順に並ぶ）ので、
// 呼び出し順を入れ替えない。
export function registerFocusedPanelActions(app: TTApplication): void {
  registerFocusedPanelAreaActions(app);
  registerThinkListActions(app);
  registerApplicationStateActions(app);
  registerWorkingPaneActions(app);
  registerDisplayActions();
  registerTextEditorFindActions(app);

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

  // ── 巻戻（1時間前への復元）──────────────────────────
  // TODO: バックエンドに過去版を参照できる
  //       復元APIを新設し、下記2アクションの中身を実装する。
  //        - 単一Think:  直前にフォーカスされた file_id 1件のみを1時間前のレコードで上書き
  //          （対象は WorkingPanel.FocusedPane.FileHistory の先頭）
  //        - 全体:       Vault 全体を1時間前のスナップショットで置換
  //       現状はUIの受け皿のみで、実行しても復元は行われない。
  TTActions.Register(UNAVAILABLE_ACTIONS.rollbackThink);
  TTActions.Register(UNAVAILABLE_ACTIONS.rollbackAll);

  registerTextEditorCursorMoveActions(app);
  registerTextEditorHighlighterToolbarActions(app);
  registerTextEditorCursorContentActions(app);
  registerTextEditorHeadingNavActions(app);
  registerTextEditorKeyBindingActions(app);
  registerTextEditorColorBindingActions(app);
  registerTextEditorSearchTagActions(app);
  registerTextEditorDictionaryActions(app);
  registerTextEditorCurrentFoldingActions(app);
  registerTextEditorDateActions(app);
  registerTextEditorBulletActions(app);
  registerTextEditorCommentActions(app);
  registerTextEditorFoldingHeadingActions(app);
  registerTextEditorPasteActions(app);
}
