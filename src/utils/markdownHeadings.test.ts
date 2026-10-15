import { describe, it, expect } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import { getHeadingAttributes } from './markdownHeadings';

/** getHeadingAttributes が使うモデル API だけを持つスタブ（折畳なし） */
function stubEditor(source: string): MonacoEditor.IStandaloneCodeEditor {
  const lines = source.split('\n');
  const lineStart = (n: number) => lines.slice(0, n - 1).reduce((sum, l) => sum + l.length + 1, 0);
  const model = {
    getValue: () => source,
    getLineCount: () => lines.length,
    getLineContent: (n: number) => lines[n - 1],
    getOffsetAt: ({ lineNumber }: { lineNumber: number }) => lineStart(lineNumber),
  };
  return { getModel: () => model } as unknown as MonacoEditor.IStandaloneCodeEditor;
}

describe('getHeadingAttributes', () => {
  it('コードフェンス内の # 行を見出しとして数えない（兄弟の親番号がずれない）', () => {
    const source = [
      'title',
      '# 日記',
      '## A',
      '```bash',
      '# comment',
      '```',
      '## B',
      '## C',
    ].join('\n');
    const headings = getHeadingAttributes(stubEditor(source));
    expect(headings.map(h => [h.line, h.headingNumber])).toEqual([
      [2, '1'],
      [3, '1.1'],
      [7, '1.2'],
      [8, '1.3'],
    ]);
  });
});
