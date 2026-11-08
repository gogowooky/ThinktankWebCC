import { describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import { unfoldRegionsHidingLine } from './markdownHeadings';

/** [start, end, collapsed] の領域を持つ偽の折畳モデル */
function fakeEditor(regions: Array<[number, number, boolean]>) {
  const toggleCollapseState = vi.fn();
  const foldingModel = {
    regions: {
      length: regions.length,
      isCollapsed: (i: number) => regions[i][2],
      getStartLineNumber: (i: number) => regions[i][0],
      getEndLineNumber: (i: number) => regions[i][1],
      toRegion: (i: number) => ({ index: i }),
    },
    toggleCollapseState,
  };
  const editor = { getContribution: () => ({ foldingModel }) } as unknown as MonacoEditor.IStandaloneCodeEditor;
  return { editor, toggleCollapseState };
}

describe('unfoldRegionsHidingLine', () => {
  it('行を隠している閉じた見出し（祖先を含む）だけを開く', () => {
    const { editor, toggleCollapseState } = fakeEditor([
      [1, 20, true],   // # A（閉）… 20行目を含む
      [5, 20, true],   // ## A-2（閉）… 20行目を含む
      [10, 12, true],  // ### 別（閉）… 含まない
      [15, 20, false], // ### 開いている
    ]);
    expect(unfoldRegionsHidingLine(editor, 20)).toBe(2);
    expect(toggleCollapseState).toHaveBeenCalledWith([{ index: 0 }, { index: 1 }]);
  });

  it('隠れていなければ何もしない（見出し行自身は隠れていない扱い）', () => {
    const { editor, toggleCollapseState } = fakeEditor([[20, 25, true]]);
    expect(unfoldRegionsHidingLine(editor, 20)).toBe(0);
    expect(toggleCollapseState).not.toHaveBeenCalled();
  });
});
