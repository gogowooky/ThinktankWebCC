/**
 * editorDropActions.ts
 * テキストエディタへの URL・パスの D&D と、Thinkファイルの D&D（Pane への Load・タグ挿入）のアクション。
 *
 * registerTextEditorCursorContentActions（textEditorCursorContentActions.ts）から順に呼ばれる。
 */
import type { TTApplication } from '../TTApplication';
import type { TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { showDefaultMenu } from '../../utils/defaultMenu';
import { getErrorMessage } from '../../utils/errorMessage';
import { cursorContentHelpers } from './cursorContentHelpers';

export function registerEditorDropActions(app: TTApplication): void {
  const { thinkRefTag, linkTagForSource } = cursorContentHelpers(app);

  // ── URL / パス D&D ─────────────────────────────────────────────────────
  const consumeTextEditorDrop = (item: TTActionItem) => {
    const ctx = TTShortcutManager.instance.consumePendingTextEditorDrop();
    if (!ctx) item.Result = '[ドロップ情報なし]';
    return ctx;
  };

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DDInsert:Menu',
    Description: 'D&Dされた外部URLまたはパスの挿入方法をメニューから選ぶ',
    Completion: async (item) => {
      const ctx = consumeTextEditorDrop(item);
      if (!ctx) return;
      const menuName = 'LINK.D&D';
      const actionId = await showDefaultMenu(menuName, ctx.editor.getDomNode?.() ?? null, `${menuName}: ${ctx.target}`);
      if (!actionId) {
        ctx.editor.focus();
        item.Result = 'キャンセルしました';
        return;
      }
      TTShortcutManager.instance.setPendingTextEditorDrop(ctx);
      const selected = await TTActions.Execute(actionId);
      item.Result = selected.Result;
      item.Allow = selected.Allow;
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DDInsert:Link',
    Description: 'D&DされたURLまたはパスをそのままテキストとして挿入する',
    Completion: (item) => {
      const ctx = consumeTextEditorDrop(item);
      if (!ctx) return;
      // パスは本文中でもlinkファイルの # Link と同じ引用形式に統一する。
      // URLは従来どおり引用符を付けず、そのまま挿入する。
      const insertion = ctx.kind === 'path' ? `"${ctx.target.replace(/"/g, '""')}"` : ctx.target;
      ctx.editor.executeEdits('external-drop-link', [{ range: ctx.range, text: insertion, forceMoveMarkers: true }]);
      ctx.editor.focus();
      item.Result = `Insert: ${insertion}`;
    },
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DDInsert:Tag',
    Description: 'D&DされたURLまたはパスのlinkファイルを作成し、参照タグを挿入する',
    Completion: async (item) => {
      const ctx = consumeTextEditorDrop(item);
      if (!ctx) return;
      try {
        const tag = await linkTagForSource({
          target: ctx.target,
          title: ctx.title,
          ...(ctx.pageTitle ? { pageTitle: ctx.pageTitle } : {}),
          ...(ctx.isDirectory !== undefined ? { isDirectory: ctx.isDirectory } : {}),
        });
        ctx.editor.executeEdits('external-drop-tag', [{ range: ctx.range, text: tag, forceMoveMarkers: true }]);
        ctx.editor.focus();
        item.Result = `Insert: ${tag}`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    },
  });

  // ── ThinkFileDrag（D&D）─────────────────────────────────────────────────
  // 疑似キー ThinkFileDrag / Alt+ThinkFileDrag（docs/DefaultShortcut.md）の実行先。
  // ペイロード（ThinkID・配置先）は TTShortcutManager.setPendingThinkDrop() で
  // 事前にセットされ、consumePendingThinkDrop() で一度だけ読み取る。
  const contentTypeToMediaType = (contentType: string): import('../../types').MediaType => {
    switch (contentType) {
      case 'html': return 'html';
      case 'markdown': return 'markdown';
      case 'bundle': return 'datagrid';
      case 'table': return 'datagrid';
      case 'chat': return 'chat';
      default: return 'texteditor';
    }
  };

  TTActions.Register({
    ActionID: 'WorkingPanel.DroppedFile.ID:Load',
    Description: 'ドロップされたThinkファイルをPaneにLoadする',
    Completion: (item) => {
      const ctx = TTShortcutManager.instance.consumePendingThinkDrop();
      if (!ctx) {
        item.Result = '[ドロップ情報なし]';
        return;
      }
      app.WorkingPanel.DroppedFileID = ctx.thinkId;
      const think = app.Models.Vault.GetThink(ctx.thinkId);
      const mediaType = think ? contentTypeToMediaType(think.ContentType) : 'texteditor';
      const title = think?.Name ?? ctx.thinkId;

      if (ctx.kind === 'load-replace') {
        const area = app.WorkingPanel.GetArea(ctx.areaId);
        if (!area) { item.Result = `[Pane未検出] ${ctx.areaId}`; return; }
        area.OpenThink(ctx.thinkId, mediaType, title);
        item.Result = `Load（差し替え）: ${title}`;
        return;
      }
      if (ctx.kind !== 'load-place') {
        item.Result = '[不正なドロップ情報]';
        return;
      }

      if (ctx.overlayType === 'add') {
        if (ctx.dir === 'left') app.WorkingPanel.AddToLeft(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'right') app.WorkingPanel.AddToRight(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'up') app.WorkingPanel.AddToTop(ctx.thinkId, mediaType, title);
        else app.WorkingPanel.AddToBottom(ctx.thinkId, mediaType, title);
      } else {
        if (ctx.areaId) app.WorkingPanel.FocusArea(ctx.areaId);
        if (ctx.dir === 'left') app.WorkingPanel.AddLeft(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'right') app.WorkingPanel.AddRight(ctx.thinkId, mediaType, title);
        else if (ctx.dir === 'up') app.WorkingPanel.AddAbove(ctx.thinkId, mediaType, title);
        else app.WorkingPanel.AddBelow(ctx.thinkId, mediaType, title);
      }
      item.Result = `Load（新規Pane・${ctx.dir}）: ${title}`;
    },
  });

  TTActions.Register({
    ActionID: 'WorkingPanel.DroppedFile.ID:Insert',
    Description: 'ドロップされたThinkファイルを [memo:{ID}] タグ（linkファイルは [gdrive:{ID}] 等のLinkタグ）としてコンテンツ内に挿入する',
    Completion: (item) => {
      const ctx = TTShortcutManager.instance.consumePendingThinkDrop();
      const editor = TTShortcutManager.instance.activeEditor;
      if (!ctx) { item.Result = '[ドロップ情報なし]'; return; }
      app.WorkingPanel.DroppedFileID = ctx.thinkId;
      if (!editor) { item.Result = '[エディタ未選択]'; return; }
      // 本文の読込を待つ間にキャレットが動いても、ドロップ時点の位置へ入れる
      const sel = editor.getSelection();
      const insert = (text: string) => {
        editor.executeEdits('think-drop', [{ range: sel, text, forceMoveMarkers: true }]);
        editor.focus();
        item.Result = `Insert: ${text}`;
      };
      return thinkRefTag(ctx.thinkId).then(insert);
    },
  });
}
