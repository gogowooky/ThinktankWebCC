/**
 * textEditorPasteActions.ts
 * TextEditor.EditText.PasteMarkdown アクションの登録。
 *
 * クリップボードのテキストを貼り付ける。ただし貼り付けるテキストが Markdown
 * （ATX 見出しを含む）の場合は、貼付位置の見出しレベルを判定し、貼り付けテキスト中の
 * 見出しが貼付位置の見出しの「子見出し」になるよう # の数をシフトしてから貼り付ける。
 */
import type { TTApplication } from '../TTApplication';
import { TTActions } from '../TTActions';
import { TTShortcutManager } from '../TTShortcutManager';
import { collectHeadings } from '../../utils/markdownSections';
import { getErrorMessage } from '../../utils/errorMessage';

/** 貼付位置（カーソル行）を内包する直近の見出しレベル。見出し配下でなければ 0。 */
function parentHeadingLevel(docValue: string, cursorLine: number): number {
  let level = 0;
  for (const h of collectHeadings(docValue)) {
    if (h.line <= cursorLine) level = h.level;
    else break;
  }
  return level;
}

/**
 * 貼り付けテキスト中の ATX 見出しを、最上位が parentLevel + 1 になるよう一括シフトする。
 * フェンス内の # は collectHeadings 基準で見出し扱いしない。見出しが無ければ原文のまま。
 */
export function reparentPastedHeadings(pasteText: string, parentLevel: number): string {
  const headings = collectHeadings(pasteText);
  if (headings.length === 0) return pasteText;

  const minLevel = Math.min(...headings.map(h => h.level));
  const shift = parentLevel + 1 - minLevel;
  if (shift === 0) return pasteText;

  const headingLines = new Set(headings.map(h => h.line));
  const lines = pasteText.split('\n');
  return lines
    .map((line, i) => {
      if (!headingLines.has(i + 1)) return line;
      const m = line.match(/^(#+)(?=\s)/);
      if (!m) return line;
      const newLevel = Math.min(6, Math.max(1, m[1].length + shift));
      return '#'.repeat(newLevel) + line.slice(m[1].length);
    })
    .join('\n');
}

export function registerTextEditorPasteActions(_app: TTApplication): void {
  TTActions.Register({
    ActionID: 'TextEditor.EditText.PasteMarkdown',
    Description: 'クリップボードを貼り付ける（Markdownなら見出しを貼付位置の子見出しに調整）',
    Completion: async (item) => {
      const editor = TTShortcutManager.instance.activeEditor;
      const isEditorFocused = !!document.activeElement?.closest('.monaco-editor');
      if (!editor || !isEditorFocused) { item.Result = '[エディタ未フォーカス]'; return; }

      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) { item.Result = '[モデル/選択なし]'; return; }

      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch (err) {
        item.Result = `[エラー] クリップボード読取失敗: ${getErrorMessage(err)}`;
        return;
      }
      if (!text) { item.Result = '[クリップボード空]'; return; }

      const headings = collectHeadings(text);
      const insert = headings.length === 0
        ? text
        : reparentPastedHeadings(text, parentHeadingLevel(model.getValue(), selection.startLineNumber));

      editor.executeEdits('paste-markdown', [{ range: selection, text: insert, forceMoveMarkers: true }]);
      editor.focus();

      item.Result = headings.length === 0
        ? 'そのまま貼り付け（見出しなし）'
        : `見出しを子レベルに調整して貼り付け（${headings.length}見出し）`;
    },
  });
}
