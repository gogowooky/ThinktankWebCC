import { expect, it, vi } from 'vitest';
import type { CancellationToken, editor, languages } from 'monaco-editor';

it('registers folding and color providers once and preserves ranges and alpha edits', async () => {
  const providers = await import('./editorProviders');
  const folding = vi.fn<(language: string, provider: languages.FoldingRangeProvider) => { dispose: () => void }>(() => ({ dispose() {} }));
  const color = vi.fn<(language: string, provider: languages.DocumentColorProvider) => { dispose: () => void }>(() => ({ dispose() {} }));
  const monaco = { languages: { registerFoldingRangeProvider: folding, registerColorProvider: color, FoldingRangeKind: { Region: 'region' } } } as unknown as typeof import('monaco-editor');
  providers.registerMarkdownFolding(monaco); providers.registerMarkdownFolding(monaco);
  providers.registerHexColorProvider(monaco); providers.registerHexColorProvider(monaco);
  expect(folding).toHaveBeenCalledTimes(1); expect(color).toHaveBeenCalledTimes(1);
  const token = {} as CancellationToken;
  const foldingModel = { getValue: () => '# A\nbody\n# B\nbody' } as editor.ITextModel;
  const ranges = await folding.mock.calls[0][1].provideFoldingRanges(foldingModel, {}, token);
  expect(ranges).toEqual([{ start: 1, end: 2, kind: 'region' }, { start: 3, end: 4, kind: 'region' }]);

  const model = { getValue: () => 'x #0f08', getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }) } as editor.ITextModel;
  const provider = color.mock.calls[0][1];
  const colors = await provider.provideDocumentColors(model, token);
  expect(colors).toEqual([{ color: { red: 0, green: 1, blue: 0, alpha: 136 / 255 },
    range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 8 } }]);
  const presentations = await provider.provideColorPresentations(model, colors![0], token);
  expect(presentations).toEqual([{ label: '#00ff0088', textEdit: { range: colors![0].range, text: '#00ff0088' } }]);
});
