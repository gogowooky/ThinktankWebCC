/**
 * tagEditActions.ts
 * 「タグ挿入」メニュー（docs/DefaultMenu.md）によるタグの挿入・付け替えと、タグを外すアクション。
 *
 * registerTextEditorCursorContentActions（textEditorCursorContentActions.ts）から順に呼ばれる。
 */
import type { TTApplication } from '../TTApplication';
import type { TTActionItem } from '../TTAction';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { showDefaultMenu } from '../../utils/defaultMenu';
import { getErrorMessage } from '../../utils/errorMessage';
import { cursorContentHelpers, classifyTagSubTag } from './cursorContentHelpers';

// タグ挿入メニューで挿入する本文。既定は `[ID:]` だが、アンカー系はID名を含まない
// 固定書式（docs/DefaultSearchTag.md の Tag.Anchor 8.1 / 8.2 の記法）になる。
const TAG_INSERT_TEXT: Record<string, string> = {
  Jump: '[:>]', // 8.1 [:anchor] で始まる行へのジャンプ
  Reference: '[:]',  // 8.2 anchorテキストのHighlighter設定
};

export function registerTagEditActions(app: TTApplication): void {
  const { getTextOnCursorSafe } = cursorContentHelpers(app);

  /**
   * 「タグ挿入」メニュー（docs/DefaultMenu.md）で選んだタグを選択範囲の位置に入れる。
   * 選択文字があれば、それをタグの値の位置（閉じ括弧の直前）に入れて囲む。
   * 選択範囲はメニュー表示でフォーカスが移る前に確保しておく。
   * クリップボードは使わず1回の編集にまとめる（Undo 1回で元に戻り、クリップボードも汚さない）。
   */
  const insertTagFromMenu = (
    editor: typeof TTShortcutManager.prototype.activeEditor,
    item: TTActionItem,
    /** 置き換える範囲とタグに入れる値。省略時は選択範囲と選択文字 */
    target?: { range: typeof TTShortcutManager.prototype.activeEditor; value: string },
  ): Promise<void> => {
    const model = editor.getModel();
    const sel = target?.range ?? editor.getSelection();
    const selected: string = target ? target.value : sel && !sel.isEmpty() ? model.getValueInRange(sel) : '';
    return showDefaultMenu('タグ挿入', editor.getDomNode?.() ?? null).then(id => {
      if (!id) {
        item.Result = 'メニューの選択をキャンセルしました';
        return;
      }
      const tag = TAG_INSERT_TEXT[id] ?? `[${id}:]`;
      // [ID:] なら ':' の後ろ、[:>] なら '>' の後ろ、[:] なら ':' の後ろ
      const caret = tag.length - 1;
      const text = tag.slice(0, caret) + selected + tag.slice(caret);
      const startOffset = model.getOffsetAt({ lineNumber: sel.startLineNumber, column: sel.startColumn });
      editor.executeEdits('tag-insert-menu', [{ range: sel, text, forceMoveMarkers: true }]);
      // キャレットは選択文字の直後（閉じ括弧の手前）。選択が無ければ値を続けて入力できる位置
      editor.setPosition(model.getPositionAt(startOffset + caret + selected.length));
      editor.focus();
      item.Result = target ? `タグを ${tag} に変更しました`
        : selected ? `選択文字をタグ ${tag} で囲みました` : `タグ ${tag} を挿入しました`;
    });
  };

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:Menu',
    Description: 'カーソル位置のテキスト種別に応じたアクションメニューを表示します（文字選択中はタグ挿入メニューで選択文字を囲む）',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        const sel = editor?.getSelection?.();
        // 文字選択中、またはカーソル位置が url/filepath/tag のいずれでもない場合は「タグ挿入」メニュー
        const text = sel && !sel.isEmpty() ? '' : getTextOnCursorSafe();
        if (!text) {
          if (!editor?.getModel?.()) {
            item.Result = 'エディタが見つかりません';
            return;
          }
          return insertTagFromMenu(editor, item);
        }

        // メニューの中身は docs/DefaultMenu.md の、種類名（Url / File / タグの種類）で始まる行。
        // 項目の ID 列が実行する ActionID になる（並び・表示名・先頭文字キーも md 側で決める）
        const kind = text.startsWith('http://') || text.startsWith('https://') ? 'Url'
          : text.startsWith('[') && text.endsWith(']') ? classifyTagSubTag(text)
          : 'File';

        return showDefaultMenu(kind, editor?.getDomNode?.() ?? null, `${kind}: ${text}`).then(actionId => {
          if (!actionId) {
            item.Result = 'メニューの選択をキャンセルしました';
            return;
          }
          const res = TTActions.Execute(actionId, item.Mods);
          if (res instanceof Promise) {
            return res.then(subItem => { item.Result = subItem.Result; });
          }
          item.Result = res.Result;
        });
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCaretPos',
    Description: '文字選択中はタグ挿入メニューで選んだタグで選択文字を囲み、選択していなければ DoOnCursorPos と同じく対象を開く',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        const model = editor?.getModel?.();
        // メニュー表示でフォーカスが移る前に、選択範囲と選択文字を確保しておく
        const sel = editor?.getSelection?.();
        if (!editor || !model || !sel || sel.isEmpty()) {
          const res = TTActions.Execute('TextEditor.CurrentEditor.DoOnCursorPos', item.Mods);
          if (res instanceof Promise) return res.then(subItem => { item.Result = subItem.Result; });
          item.Result = res.Result;
          return;
        }
        return insertTagFromMenu(editor, item);
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  /** カーソル位置の [ID:値] タグの範囲と中身。該当しなければ null（タグの位置判定は getCurrentTextOnCursor と同じ） */
  const tagOnCursor = (editor: typeof TTShortcutManager.prototype.activeEditor) => {
    const pos = editor?.getPosition?.();
    const model = editor?.getModel?.();
    if (!pos || !model) return null;
    const lineContent: string = model.getLineContent(pos.lineNumber);
    const tagRegex = /\[([^\]]+)\]/g;
    let match;
    while ((match = tagRegex.exec(lineContent)) !== null) {
      const startColumn = match.index + 1;
      const endColumn = startColumn + match[0].length;
      if (pos.column < startColumn || pos.column > endColumn) continue;
      const inner = match[1];
      const colonIdx = inner.indexOf(':');
      // ID 部分が無いタグ（[TAG] や Anchor の [:見出し]）は外す・付け替える対象にしない
      if (colonIdx <= 0) return null;
      const monaco = (window as unknown as { monaco: { Range: new (a: number, b: number, c: number, d: number) => unknown } }).monaco;
      return {
        range: new monaco.Range(pos.lineNumber, startColumn, pos.lineNumber, endColumn),
        id: inner.slice(0, colonIdx).trim(),
        value: inner.slice(colonIdx + 1),
        startOffset: model.getOffsetAt({ lineNumber: pos.lineNumber, column: startColumn }) as number,
      };
    }
    return null;
  };

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:DeTag',
    Description: 'カーソル位置のタグを外し、値の文字だけを残す',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        const tag = tagOnCursor(editor);
        if (!tag) { item.Result = 'カーソル位置に [ID:値] 形式のタグがありません'; return; }
        editor.executeEdits('detag', [{ range: tag.range, text: tag.value, forceMoveMarkers: true }]);
        editor.setPosition(editor.getModel().getPositionAt(tag.startOffset + tag.value.length));
        editor.focus();
        item.Result = `タグ [${tag.id}:] を外しました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.DoOnCursorPos:ReTag',
    Description: 'カーソル位置のタグを「タグ挿入」メニューで選びなおす（値はそのまま）',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        const tag = tagOnCursor(editor);
        if (!tag) { item.Result = 'カーソル位置に [ID:値] 形式のタグがありません'; return; }
        return insertTagFromMenu(editor, item, { range: tag.range, value: tag.value });
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });
}
