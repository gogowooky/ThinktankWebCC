import type { MediaProps } from '../types';
import { INLINE_MASK_CHAR, INLINE_STYLE_RULES, colorStyleToCss, inlineStyleClass, isUnset, linkStyleClass, styleClass } from '../../../../utils/defaultColor';
import type { MarkKind, MarkStyle } from '../../../../utils/defaultColor';
import type { editor as MonacoEditor } from 'monaco-editor';

export function matchMarkStyle(
  kind: MarkKind,
  styles: MarkStyle[],
  textAfterIndent: string,
): { className: string; } | null {
  const candidates = styles
    .map((s, index) => ({ ...s, index }))
    .sort((a, b) => b.mark.length - a.mark.length);

  for (const c of candidates) {
    const pattern = c.mark.endsWith(' ') ? c.mark : c.mark + ' ';
    if (!textAfterIndent.startsWith(pattern)) continue;
    return colorStyleToCss(c.style)
      ? { className: styleClass(kind, c.index + 1) }
      : null;
  }
  return null;
}

export function applyEditorDecorations(editor: MonacoEditor.IStandaloneCodeEditor | null, collection: MonacoEditor.IEditorDecorationsCollection | null, editorSettings: MediaProps['editorSettings']): void {
  if (!editor || !collection || !editorSettings) return;

  const model = editor.getModel();
  if (!model) return;

  // コメント設定のパース
  // Comment / Bullet のスタイルは editorSettings から配列で直接取得します
  const commentStyles = editorSettings.commentStyles || [];
  const bulletStyles = editorSettings.bulletStyles || [];

  // --- ハイライトグループの動的スタイル注入 ---
  let highlightStyleEl = document.getElementById('text-editor-highlight-styles');
  if (!highlightStyleEl) {
    highlightStyleEl = document.createElement('style');
    highlightStyleEl.id = 'text-editor-highlight-styles';
    document.head.appendChild(highlightStyleEl);
  }
  // 色・属性は docs/DefaultColor.md 由来の TextEditor.Highlighter.Style(1..6).* に従う
  highlightStyleEl.textContent = editorSettings.highlightStyles.map((style, index) => {
    const decls = colorStyleToCss(style);
    return decls ? `.${styleClass('Highlighter', index + 1)} { ${decls} border-radius: 2px; }` : '';
  }).filter(Boolean).join('\n');

  const newDecorations: MonacoEditor.IModelDeltaDecoration[] = [];
  const linesCount = model.getLineCount();

  for (let i = 1;i <= linesCount;i++) {
    const lineContent = model.getLineContent(i);

    // 見出しの装飾
    const match = lineContent.match(/^(\s{0,3})(#{1,6})\s/);
    if (match) {
      const level = match[2].length;
      const style = editorSettings.headingStyles[level - 1];

      const minimapOptions = style && !isUnset(style.Color) ? {
        color: style.Color,
        position: 1 // (window as any).monaco.editor.MinimapPosition.Inline
      } : undefined;

      newDecorations.push({
        range: new window.monaco!.Range(i, 1, i, lineContent.length + 1),
        options: {
          isWholeLine: true,
          inlineClassName: styleClass('Heading', level),
          minimap: minimapOptions
        }
      });
    } else {
      // インデントのスキップ
      const indentMatch = lineContent.match(/^([ \t\u3000]*)(.*)/);
      const textAfterIndent = indentMatch ? indentMatch[2] : lineContent;

      // 行頭記号の装飾。Comment を先に見て、該当しなければ Bullet を見る
      const matched = matchMarkStyle('Comment', commentStyles, textAfterIndent)
        ?? matchMarkStyle('Bullet', bulletStyles, textAfterIndent);

      if (matched) {
        newDecorations.push({
          range: new window.monaco!.Range(i, 1, i, lineContent.length + 1),
          options: {
            isWholeLine: true,
            inlineClassName: matched.className
          }
        });
      }
    }

    // 全角スペースの装飾
    if (editorSettings.showFullWidthSpace) {
      const regex = /\u3000/g;
      let spaceMatch;
      while ((spaceMatch = regex.exec(lineContent)) !== null) {
        const startCol = spaceMatch.index + 1;
        const endCol = startCol + 1;
        newDecorations.push({
          range: new window.monaco!.Range(i, startCol, i, endCol),
          options: {
            inlineClassName: 'full-width-space-decoration'
          }
        });
      }
    }

    // 単語ハイライトの装飾（複数グループ対応）
    if (editorSettings.highlightWord) {
      // カンマでグループ分割 (最大5つ)
      const groups = editorSettings.highlightWord.split(',').slice(0, 5);
      groups.forEach((groupStr, groupIndex) => {
        // 半角スペースで単語分割
        const words = groupStr.split(' ').map(w => w.trim()).filter(w => w.length > 0);
        if (words.length === 0) return;

        const groupStyle = editorSettings.highlightStyles[groupIndex];

        words.forEach(word => {
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedWord, 'g');
          let wordMatch;
          while ((wordMatch = regex.exec(lineContent)) !== null) {
            const startCol = wordMatch.index + 1;
            const endCol = startCol + word.length;
            newDecorations.push({
              range: new window.monaco!.Range(i, startCol, i, endCol),
              options: {
                inlineClassName: styleClass('Highlighter', groupIndex + 1),
                minimap: groupStyle && !isUnset(groupStyle.BgColor) ? {
                  color: groupStyle.BgColor,
                  position: 1 // Inline
                } : undefined
              }
            });
          }
        });
      });
    }

    // 1. ダブルクォーテーションで囲まれたURIやファイルパスのハイライト
    const quotedRegex = /"([^"]+)"/g;
    let quotedMatch;
    const decoratedRanges: { start: number; end: number; }[] = [];

    const isRangeDecorated = (start: number, end: number) => {
      return decoratedRanges.some(r => {
        return (start >= r.start && start < r.end) || (end > r.start && end <= r.end) || (start <= r.start && end >= r.end);
      });
    };

    while ((quotedMatch = quotedRegex.exec(lineContent)) !== null) {
      const content = quotedMatch[1];
      const isUri = /^https?:\/\//i.test(content) || /^file:\/\//i.test(content);
      const isFilePath = /^([a-zA-Z]:\\|\\\\)/.test(content) || /^([a-zA-Z]:\/)/.test(content);
      if (isUri || isFilePath) {
        const startCol = quotedMatch.index + 2; // " の次から
        const endCol = startCol + content.length; // 内側の文字列の長さ分

        newDecorations.push({
          range: new window.monaco!.Range(i, startCol, i, endCol),
          options: {
            inlineClassName: linkStyleClass('filepath')
          }
        });
        // ダブルクォーテーション全体を含む範囲を装飾済みとして記録する
        decoratedRanges.push({
          start: quotedMatch.index + 1,
          end: quotedMatch.index + 1 + quotedMatch[0].length
        });
      }
    }

    // 2. URL のハイライト
    const urlRegex = /https?:\/\/[^\s")]+/g;
    let urlMatch;
    while ((urlMatch = urlRegex.exec(lineContent)) !== null) {
      const startCol = urlMatch.index + 1;
      const endCol = startCol + urlMatch[0].length;
      if (isRangeDecorated(startCol, endCol)) continue;

      newDecorations.push({
        range: new window.monaco!.Range(i, startCol, i, endCol),
        options: {
          inlineClassName: linkStyleClass('url')
        }
      });
      decoratedRanges.push({ start: startCol, end: endCol });
    }

    // 3. Filepath のハイライト
    const fileRegex = /([a-zA-Z]:\\|\\\\)[^\s"<>|?*]+/g;
    let fileMatch;
    while ((fileMatch = fileRegex.exec(lineContent)) !== null) {
      const startCol = fileMatch.index + 1;
      const endCol = startCol + fileMatch[0].length;
      if (isRangeDecorated(startCol, endCol)) continue;

      newDecorations.push({
        range: new window.monaco!.Range(i, startCol, i, endCol),
        options: {
          inlineClassName: linkStyleClass('filepath')
        }
      });
      decoratedRanges.push({ start: startCol, end: endCol });
    }

    // 4. Tag のハイライト
    const tagRegex = /\[([^\]]+)\]/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(lineContent)) !== null) {
      const startCol = tagMatch.index + 1;
      const endCol = startCol + tagMatch[0].length;
      if (isRangeDecorated(startCol, endCol)) continue;

      newDecorations.push({
        range: new window.monaco!.Range(i, startCol, i, endCol),
        options: {
          inlineClassName: linkStyleClass('tag')
        }
      });
      decoratedRanges.push({ start: startCol, end: endCol });
    }

    // 5. インライン書式（**bold** / __underline__ / ~~strikethrough~~ / *italic*）
    // URL/Tag の decoratedRanges とは独立に判定する。両方に該当する範囲は
    // Monaco が両方の inlineClassName を適用するため、片方を捨てる必要はない。
    // 判定の済んだ記号だけを伏せ字にして次のルールへ渡すことで、`**太字**` の `*` が
    // 斜体の記号として再解釈されるのを防ぎつつ、`*斜体の中の **太字**` の入れ子は残す。
    let scanLine = lineContent;
    for (const rule of INLINE_STYLE_RULES) {
      const regex = new RegExp(rule.pattern, 'g');
      const markers: number[] = [];
      let inlineMatch;
      while ((inlineMatch = regex.exec(scanLine)) !== null) {
        const startCol = inlineMatch.index + 1;
        const endCol = startCol + inlineMatch[0].length;
        newDecorations.push({
          range: new window.monaco!.Range(i, startCol, i, endCol),
          options: {
            inlineClassName: inlineStyleClass(rule.name)
          }
        });
        markers.push(inlineMatch.index, inlineMatch.index + inlineMatch[0].length - rule.marker.length);
      }
      for (const at of markers) {
        scanLine = scanLine.slice(0, at)
          + INLINE_MASK_CHAR.repeat(rule.marker.length)
          + scanLine.slice(at + rule.marker.length);
      }
    }
  }

  collection.set(newDecorations);
}
