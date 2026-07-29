/**
 * textEditorFoldingActions.ts
 * TextEditor.FoldingHeading.* アクション（見出しレベルの昇降）の登録。
 *
 * 元は views/TTFocusedPanelActions.ts に同居していたが、独立したドメインのため分離した。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { getHeadingLevel } from '../../utils/markdownHeadings';
import { getErrorMessage } from '../../utils/errorMessage';

export function registerTextEditorFoldingHeadingActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.FoldingHeading.IncLevel',
    Description: '見出し行のレベルを1つ上げる（非見出し行は見出し化）',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

        const startLine = selection.startLineNumber;
        const endLine = selection.endLineNumber;
        const isSelectionEmpty = selection.isEmpty();
        const edits: any[] = [];
        let nextCursorPosition: any = null;

        if (isSelectionEmpty) {
          const pos = editor.getPosition();
          if (!pos) { item.Result = '[位置なし]'; return; }
          const lineContent = model.getLineContent(pos.lineNumber);
          const level = getHeadingLevel(lineContent);
          const isAtLineStart = (pos.column === 1);

          if (isAtLineStart) {
            // カーソル位置がHeading行/非Heading行の先頭の場合は、新しいHeading行を挿入する。
            edits.push({
              range: new (window as any).monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
              text: "# \n",
              forceMoveMarkers: true
            });
            // 挿入された新しい行（# ）の末尾（3文字目）にカーソルを置く
            nextCursorPosition = { lineNumber: pos.lineNumber, column: 3 };
          } else {
            if (level > 0) {
              // カーソル位置がHeading行だが先頭ではない場合は、HeadingのLevelを１つ増やす。
              const match = lineContent.match(/^(\s*)(#+)/);
              if (match) {
                const indent = match[1];
                const hashes = match[2];
                const insertPos = indent.length + hashes.length + 1;
                edits.push({
                  range: new (window as any).monaco.Range(pos.lineNumber, insertPos, pos.lineNumber, insertPos),
                  text: "#",
                  forceMoveMarkers: true
                });
              }
            } else {
              // カーソル位置がHeading行ではない行で先頭ではない場合は、先頭に# を挿入してHeading行とする
              edits.push({
                range: new (window as any).monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
                text: "# ",
                forceMoveMarkers: true
              });
            }
          }
        } else {
          // 選択範囲内のすべての行に対し
          for (let line = startLine; line <= endLine; line++) {
            const lineContent = model.getLineContent(line);
            const level = getHeadingLevel(lineContent);
            if (level > 0) {
              const match = lineContent.match(/^(\s*)(#+)/);
              if (match) {
                const indent = match[1];
                const hashes = match[2];
                const insertPos = indent.length + hashes.length + 1;
                edits.push({
                  range: new (window as any).monaco.Range(line, insertPos, line, insertPos),
                  text: "#",
                  forceMoveMarkers: false
                });
              }
            }
          }
        }

        if (edits.length > 0) {
          editor.executeEdits("IncLevel", edits);
          if (nextCursorPosition) {
            editor.setPosition(nextCursorPosition);
          }
          item.Result = isSelectionEmpty ? `見出しレベルUP (L${startLine})` : `見出しレベルUP: ${startLine}-${endLine}行`;
        } else {
          item.Result = '変更なし';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.FoldingHeading.DecLevel',
    Description: '見出し行のレベルを1つ下げる',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) { item.Result = '[エディタ未選択]'; return; }
        const model = editor.getModel();
        const selection = editor.getSelection();
        if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

        const startLine = selection.startLineNumber;
        const endLine = selection.endLineNumber;
        const isSelectionEmpty = selection.isEmpty();
        const edits: any[] = [];

        for (let line = startLine; line <= endLine; line++) {
          const lineContent = model.getLineContent(line);
          const level = getHeadingLevel(lineContent);
          if (level > 0) {
            const match = lineContent.match(/^(\s*)(#+)(\s*)/);
            if (match) {
              const indent = match[1];
              const hashes = match[2];
              const spaces = match[3];
              if (level === 1) {
                // # の場合は# とその後ろのスペースを削除する
                const deleteLen = hashes.length + (spaces.length > 0 ? 1 : 0);
                const startCol = indent.length + 1;
                const endCol = startCol + deleteLen;
                edits.push({
                  range: new (window as any).monaco.Range(line, startCol, line, endCol),
                  text: "",
                  forceMoveMarkers: false
                });
              } else {
                // # を1つ減らす
                const startCol = indent.length + hashes.length;
                const endCol = startCol + 1;
                edits.push({
                  range: new (window as any).monaco.Range(line, startCol, line, endCol),
                  text: "",
                  forceMoveMarkers: false
                });
              }
            }
          }
        }

        if (edits.length > 0) {
          editor.executeEdits("DecLevel", edits);
          item.Result = isSelectionEmpty ? `見出しレベルDOWN (L${startLine})` : `見出しレベルDOWN: ${startLine}-${endLine}行`;
        } else {
          item.Result = '変更なし';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });
}
