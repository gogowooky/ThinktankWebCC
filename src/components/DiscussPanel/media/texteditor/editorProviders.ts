import { toFoldingRanges } from '../../../../utils/markdownSections';
import type { editor as MonacoEditor, languages } from 'monaco-editor';
type IColorInformation = languages.IColorInformation;
let isMarkdownFoldingRegistered = false;

export function registerMarkdownFolding(monaco: typeof import('monaco-editor')) {
  if (isMarkdownFoldingRegistered) return;
  isMarkdownFoldingRegistered = true;

  // 範囲の算出は markdownSections に集約している。MarkdownMedia の <details> 折り畳みと
  // think.Metadata.editor.closedHeadings（行番号）を共有するため、ここで独自に数えないこと。
  monaco.languages.registerFoldingRangeProvider('markdown', {
    provideFoldingRanges: (model: MonacoEditor.ITextModel) =>
      toFoldingRanges(model.getValue()).map((range) => ({
        start: range.start,
        end: range.end,
        kind: monaco.languages.FoldingRangeKind.Region,
      })),
  });
}

export function hexToColor(hex: string): { red: number; green: number; blue: number; alpha: number; } {
  const expand = hex.length <= 4
    ? hex.split('').map(c => c + c).join('')
    : hex;
  const r = parseInt(expand.slice(0, 2), 16) / 255;
  const g = parseInt(expand.slice(2, 4), 16) / 255;
  const b = parseInt(expand.slice(4, 6), 16) / 255;
  const a = expand.length >= 8 ? parseInt(expand.slice(6, 8), 16) / 255 : 1;
  return { red: r, green: g, blue: b, alpha: a };
}

export function colorToHex(color: { red: number; green: number; blue: number; alpha: number; }): string {
  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  const rgb = `${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
  return `#${color.alpha < 1 ? rgb + toHex(color.alpha) : rgb}`;
}

const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

let isColorProviderRegistered = false;

export function registerHexColorProvider(monaco: typeof import('monaco-editor')) {
  if (isColorProviderRegistered) return;
  isColorProviderRegistered = true;

  monaco.languages.registerColorProvider('markdown', {
    provideDocumentColors(model: MonacoEditor.ITextModel) {
      const text = model.getValue();
      const results: IColorInformation[] = [];
      let match: RegExpExecArray | null;
      HEX_COLOR_REGEX.lastIndex = 0;
      while ((match = HEX_COLOR_REGEX.exec(text)) !== null) {
        const startPos = model.getPositionAt(match.index);
        const endPos = model.getPositionAt(match.index + match[0].length);
        results.push({
          color: hexToColor(match[0].slice(1)),
          range: {
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          },
        });
      }
      return results;
    },
    provideColorPresentations(_model: MonacoEditor.ITextModel, colorInfo: IColorInformation) {
      const hex = colorToHex(colorInfo.color);
      return [{ label: hex, textEdit: { range: colorInfo.range, text: hex } }];
    },
  });
}
