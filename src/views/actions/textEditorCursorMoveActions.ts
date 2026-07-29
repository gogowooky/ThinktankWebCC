/**
 * textEditorCursorMoveActions.ts
 * TextEditor.CurrentEditor.CursorPos:LineStart+/LineEnd+/PrevChar/NextChar/PrevWord/NextWord/
 * PrevLine/NextLine アクション（基本的なカーソル移動）の登録。
 *
 * 元は views/TTFocusedPanelActions.ts の registerTextEditorCursorPosActions に同居していたが、
 * 独立したドメインのため分離した。単語境界判定（CJK対応）はこのファイル専用のロジック。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { getErrorMessage } from '../../utils/errorMessage';

// ── 単語境界の判定（CursorPos:PrevWord / NextWord 用） ─────────────────────────
// 境界は次の位置に置く:
//   ・行頭 / 行末
//   ・1つまたは連続する空白文字の後ろ
//   ・半角→全角、全角→半角の切替わり
//   ・全角句点文字の後ろ
// 追加・削除したい全角句点文字はこの定数を編集する。
const FULLWIDTH_SENTENCE_PUNCT = '。、，．！？；：・…‥';

function isWordSpace(ch: string): boolean {
  // \s は全角スペース(U+3000)も含む
  return /\s/.test(ch);
}

function isFullWidthChar(ch: string): boolean {
  const c = ch.codePointAt(0);
  if (c === undefined) return false;
  return (
    (c >= 0x1100 && c <= 0x115f) || // Hangul Jamo
    (c >= 0x2e80 && c <= 0x303e) || // CJK 部首・記号
    (c >= 0x3041 && c <= 0x33ff) || // かな・記号・CJK 互換
    (c >= 0x3400 && c <= 0x4dbf) || // CJK 拡張A
    (c >= 0x4e00 && c <= 0x9fff) || // CJK 統合漢字
    (c >= 0xa000 && c <= 0xa4cf) || // イ文字
    (c >= 0xac00 && c <= 0xd7a3) || // ハングル音節
    (c >= 0xf900 && c <= 0xfaff) || // CJK 互換漢字
    (c >= 0xfe30 && c <= 0xfe4f) || // CJK 互換形
    (c >= 0xff00 && c <= 0xff60) || // 全角英数・記号（半角カナ U+FF61〜 は除外）
    (c >= 0xffe0 && c <= 0xffe6)    // 全角記号
  );
}

function isFullWidthPunct(ch: string): boolean {
  return FULLWIDTH_SENTENCE_PUNCT.includes(ch);
}

/** 行内オフセット i（1..len-1）が単語境界かどうかを返す。 */
function isWordBoundaryAt(text: string, i: number): boolean {
  const prev = text[i - 1];
  const cur = text[i];
  const prevSpace = isWordSpace(prev);
  const curSpace = isWordSpace(cur);
  // 連続空白の後ろ
  if (prevSpace && !curSpace) return true;
  // 全角句点文字の後ろ
  if (isFullWidthPunct(prev)) return true;
  // 半角↔全角の切替わり（空白は対象外）
  if (!prevSpace && !curSpace && isFullWidthChar(prev) !== isFullWidthChar(cur)) return true;
  return false;
}

export function registerTextEditorCursorMoveActions(app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:LineStart+',
    Description: 'カーソルを行頭→テキスト先頭の順に移動する。テキスト先頭では全選択する',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        if (!pos) {
          item.Result = '[位置なし]';
          return;
        }

        const lineNumber = pos.lineNumber;
        const column = pos.column;

        if (column > 1) {
          const newPos = { lineNumber, column: 1 };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = `行先頭（L${lineNumber}:C1）に移動しました`;
        } else if (lineNumber > 1) {
          const newPos = { lineNumber: 1, column: 1 };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = 'テキスト先頭（L1:C1）に移動しました';
        } else {
          const model = editor.getModel();
          if (model) {
            const lastLine = model.getLineCount();
            const lastColumn = model.getLineMaxColumn(lastLine);
            editor.setSelection({
              selectionStartLineNumber: lastLine,
              selectionStartColumn: lastColumn,
              positionLineNumber: 1,
              positionColumn: 1
            });
            item.Result = 'テキストすべてを選択しました';
          }
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:LineEnd+',
    Description: 'カーソルを行末→テキスト末尾の順に移動する。テキスト末尾では全選択する',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (!pos || !model) {
          item.Result = '[モデル/位置なし]';
          return;
        }

        const lineNumber = pos.lineNumber;
        const column = pos.column;
        const lineMaxColumn = model.getLineMaxColumn(lineNumber);
        const totalLines = model.getLineCount();
        const lastLineMaxColumn = model.getLineMaxColumn(totalLines);

        if (column < lineMaxColumn) {
          const newPos = { lineNumber, column: lineMaxColumn };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = `行末尾（L${lineNumber}:C${lineMaxColumn}）に移動しました`;
        } else if (lineNumber < totalLines || column < lastLineMaxColumn) {
          const newPos = { lineNumber: totalLines, column: lastLineMaxColumn };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = `テキスト末尾（L${totalLines}:C${lastLineMaxColumn}）に移動しました`;
        } else {
          editor.setSelection({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: totalLines,
            endColumn: lastLineMaxColumn
          });
          item.Result = 'テキストすべてを選択しました';
        }
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:PrevChar',
    Description: 'カーソルを1文字前に移動する',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        editor.trigger('keyboard', 'cursorLeft', {});
        const pos = editor.getPosition();
        item.Result = pos ? `カーソルを1文字前に移動しました（L${pos.lineNumber}:C${pos.column}）` : 'カーソルを1文字前に移動しました';
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:NextChar',
    Description: 'カーソルを1文字後に移動する',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        editor.trigger('keyboard', 'cursorRight', {});
        const pos = editor.getPosition();
        item.Result = pos ? `カーソルを1文字後に移動しました（L${pos.lineNumber}:C${pos.column}）` : 'カーソルを1文字後に移動しました';
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:PrevWord',
    Description: 'カーソルを1ワード前に移動する',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (!pos || !model) {
          item.Result = '[モデル/位置なし]';
          return;
        }

        const line = pos.lineNumber;
        const text = model.getLineContent(line);
        const b = pos.column - 1; // 0-based の境界位置

        // 現在位置より前（i < b）で最も近い境界を探す
        let target = -1;
        for (let i = b - 1; i >= 1; i--) {
          if (isWordBoundaryAt(text, i)) { target = i; break; }
        }

        if (target === -1 && b > 0) {
          target = 0; // 行頭
        }

        if (target === -1) {
          // 既に行頭 → 前行の行末へ
          if (line > 1) {
            const prevLine = line - 1;
            const prevMax = model.getLineMaxColumn(prevLine);
            const newPos = { lineNumber: prevLine, column: prevMax };
            editor.setPosition(newPos);
            editor.revealPosition(newPos);
            item.Result = `前行の行末（L${prevLine}:C${prevMax}）に移動しました`;
          } else {
            item.Result = '文書先頭のため移動しませんでした';
          }
          return;
        }

        const newPos = { lineNumber: line, column: target + 1 };
        editor.setPosition(newPos);
        editor.revealPosition(newPos);
        item.Result = `1ワード前（L${line}:C${newPos.column}）に移動しました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:NextWord',
    Description: 'カーソルを1ワード後に移動する',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (!pos || !model) {
          item.Result = '[モデル/位置なし]';
          return;
        }

        const line = pos.lineNumber;
        const text = model.getLineContent(line);
        const len = text.length;
        const b = pos.column - 1; // 0-based の境界位置

        // 現在位置より後（i > b）で最も近い境界を探す
        let target = -1;
        for (let i = b + 1; i <= len - 1; i++) {
          if (isWordBoundaryAt(text, i)) { target = i; break; }
        }

        if (target === -1 && b < len) {
          target = len; // 行末
        }

        if (target === -1) {
          // 既に行末 → 次行の行頭へ
          const lineCount = model.getLineCount();
          if (line < lineCount) {
            const newPos = { lineNumber: line + 1, column: 1 };
            editor.setPosition(newPos);
            editor.revealPosition(newPos);
            item.Result = `次行の行頭（L${line + 1}:C1）に移動しました`;
          } else {
            item.Result = '文書末尾のため移動しませんでした';
          }
          return;
        }

        const newPos = { lineNumber: line, column: target + 1 };
        editor.setPosition(newPos);
        editor.revealPosition(newPos);
        item.Result = `1ワード後（L${line}:C${newPos.column}）に移動しました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:PrevLine',
    Description: 'カーソルを1行前に移動する（文書先頭行では行頭へ）',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        if (!pos) {
          item.Result = '[位置なし]';
          return;
        }

        if (pos.lineNumber <= 1) {
          const newPos = { lineNumber: 1, column: 1 };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = '文書先頭（L1:C1）に移動しました';
          return;
        }

        // 折り畳み・折り返し・カラム維持は Monaco 既定の ArrowUp に委ねる
        editor.trigger('keyboard', 'cursorUp', {});
        const newPos = editor.getPosition();
        editor.revealPosition(newPos);
        item.Result = `一つ上の行（L${newPos.lineNumber}:C${newPos.column}）に移動しました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });

  TTActions.Register({
    ActionID: 'TextEditor.CurrentEditor.CursorPos:NextLine',
    Description: 'カーソルを1行後に移動する（文書最終行では末尾へ）',
    Completion: (item) => {
      try {
        const editor = TTShortcutManager.instance.activeEditor;
        if (!editor) {
          item.Result = '[エディタ未選択]';
          return;
        }
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (!pos || !model) {
          item.Result = '[モデル/位置なし]';
          return;
        }

        const totalLines = model.getLineCount();
        if (pos.lineNumber >= totalLines) {
          const lastLineMaxColumn = model.getLineMaxColumn(totalLines);
          const newPos = { lineNumber: totalLines, column: lastLineMaxColumn };
          editor.setPosition(newPos);
          editor.revealPosition(newPos);
          item.Result = `文書末尾（L${totalLines}:C${lastLineMaxColumn}）に移動しました`;
          return;
        }

        // 折り畳み・折り返し・カラム維持は Monaco 既定の ArrowDown に委ねる
        editor.trigger('keyboard', 'cursorDown', {});
        const newPos = editor.getPosition();
        editor.revealPosition(newPos);
        item.Result = `一つ下の行（L${newPos.lineNumber}:C${newPos.column}）に移動しました`;
      } catch (err) {
        item.Result = `[エラー] ${getErrorMessage(err)}`;
      }
    }
  });
}
