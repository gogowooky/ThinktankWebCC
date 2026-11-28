/**
 * focusedPaneRefActions.ts
 * フォーカス中の Pane の参照タグのコピーと、FocusedPane メニューのアクション。
 *
 * registerTextEditorCursorContentActions（textEditorCursorContentActions.ts）から順に呼ばれる。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { showDefaultMenu } from '../../utils/defaultMenu';
import { getErrorMessage } from '../../utils/errorMessage';
import { cursorContentHelpers } from './cursorContentHelpers';

export function registerFocusedPaneRefActions(app: TTApplication): void {
  const { thinkRefTag } = cursorContentHelpers(app);

  // ── フォーカス中のPane ──────────────────────────────────────────────────
  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.PaneNumber:Copy',
    Description: 'フォーカス中のPaneのThinkファイルを参照するタグ（[memo:ID]、linkファイルは [gdrive:ID] 等）をクリップボードにコピーする',
    Completion: async (item) => {
      try {
        const panel = app.WorkingPanel;
        const area = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
        const thinkId = area?.ResourceID;
        if (!thinkId) { item.Result = '[対象Paneなし]'; return; }
        const tag = await thinkRefTag(thinkId);
        await navigator.clipboard.writeText(tag);
        item.Result = `コピー: ${tag}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.FocusedPane.ShowMenu',
    Description: 'フォーカス中のPaneのカーソル位置に FocusedPane メニュー（docs/DefaultMenu.md）を表示し、選んだアクションを実行する',
    Completion: async (item) => {
      try {
        const panel = app.WorkingPanel;
        const areaId = panel.FocusedAreaId;
        if (!areaId) { item.Result = '[対象Paneなし]'; return; }
        const editor = TTShortcutManager.instance.getAreaEditor(areaId);
        const areaEl = document.querySelector<HTMLElement>(`.working-area[data-area-id="${CSS.escape(areaId)}"]`);
        // TextEditor ならキャレットの直下に出す。それ以外のPaneはPane上端の中央に出す
        let at: { left: number; top: number } | null = null;
        const pos = editor?.getPosition?.();
        const caret = pos ? editor.getScrolledVisiblePosition?.(pos) : null;
        const editorRect = editor?.getDomNode?.()?.getBoundingClientRect?.();
        if (caret && editorRect) at = { left: editorRect.left + caret.left, top: editorRect.top + caret.top + caret.height };
        const actionId = await showDefaultMenu('FocusedPane', editor?.getDomNode?.() ?? areaEl, 'FocusedPane', at);
        editor?.focus?.();
        if (!actionId) { item.Result = 'キャンセルしました'; return; }
        const selected = await TTActions.Execute(actionId);
        item.Result = selected.Result;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });
}
