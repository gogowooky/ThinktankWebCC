/**
 * textEditorCursorContentActions.ts
 * TextEditor.CurrentEditor.DoOnCursorPos:* アクション（カーソル位置のURL/パス/タグを
 * 判別して対応する外部連携を実行する）と、WorkingPanel.DroppedFile:* アクション
 * （Think のドラッグ&ドロップ処理）の登録。
 *
 * 中身は種類ごとのファイルに分けてあり、ここでは順に呼ぶだけにする。共通の補助関数は
 * cursorContentHelpers.ts、検索タグの URL は utils/searchTagUrls.ts にある。
 */

import type { TTApplication } from '../TTApplication';
import { registerCursorOpenActions } from './cursorOpenActions';
import { registerLinkTagActions } from './linkTagActions';
import { registerFocusedPaneRefActions } from './focusedPaneRefActions';
import { registerCursorTagOpenActions } from './cursorTagOpenActions';
import { registerTagEditActions } from './tagEditActions';
import { registerEditorDropActions } from './editorDropActions';

export function registerTextEditorCursorContentActions(app: TTApplication): void {
  registerCursorOpenActions(app);
  registerLinkTagActions(app);
  registerFocusedPaneRefActions(app);
  registerCursorTagOpenActions(app);
  registerTagEditActions(app);
  registerEditorDropActions(app);
}
