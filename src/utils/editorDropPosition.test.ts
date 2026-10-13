import { afterEach, describe, expect, it } from 'vitest';
import { clientPointToPosition } from './editorDropPosition';

// 8行の文書で 1行目（# A）と 4行目（# B）を折り畳んだ状態：見えている行は 1, 4, 7, 8
const LINES = ['# A', 'body a1', 'body a2', '# B', 'body b1', 'body b2', '# C', 'body c'];
const COLLAPSED = [[1, 3], [4, 6]];
const LINE_HEIGHT = 20;

function fakeEditor(hitTest?: { lineNumber: number; column: number }) {
  return {
    getTargetAtClientPoint: () => (hitTest ? { position: hitTest } : null),
    getContribution: () => ({
      foldingModel: {
        regions: {
          length: COLLAPSED.length,
          isCollapsed: () => true,
          getStartLineNumber: (i: number) => COLLAPSED[i][0],
          getEndLineNumber: (i: number) => COLLAPSED[i][1],
        },
      },
    }),
    getModel: () => ({
      getLineCount: () => LINES.length,
      getLineContent: (n: number) => LINES[n - 1],
      getLineMaxColumn: (n: number) => LINES[n - 1].length + 1,
    }),
    getDomNode: () => ({ getBoundingClientRect: () => ({ top: 0, left: 0 }) }),
    getLayoutInfo: () => ({ contentLeft: 0 }),
    getOption: (id: string) => (id === 'lineHeight' ? LINE_HEIGHT : { typicalHalfwidthCharacterWidth: 10 }),
    getScrollTop: () => 0,
    getScrollLeft: () => 0,
  };
}

const monacoStub = { editor: { EditorOption: { lineHeight: 'lineHeight', fontInfo: 'fontInfo' } } };

describe('clientPointToPosition while dragging over folded lines', () => {
  afterEach(() => { delete (globalThis as { window?: unknown }).window; });

  it('counts only visible rows when the hit test is unavailable', () => {
    (globalThis as { window?: unknown }).window = { monaco: monacoStub };
    // 画面2行目は # B（4行目）、3行目は # C（7行目）。隠れた 2・5 行目には送らない
    expect(clientPointToPosition(fakeEditor(), 0, LINE_HEIGHT * 1.5)).toEqual({ lineNumber: 4, column: 1 });
    expect(clientPointToPosition(fakeEditor(), 0, LINE_HEIGHT * 2.5)).toEqual({ lineNumber: 7, column: 1 });
  });

  it('moves a hit on a hidden line to the end of its heading line', () => {
    expect(clientPointToPosition(fakeEditor({ lineNumber: 5, column: 2 }), 0, 0)).toEqual({ lineNumber: 4, column: 4 });
    expect(clientPointToPosition(fakeEditor({ lineNumber: 7, column: 2 }), 0, 0)).toEqual({ lineNumber: 7, column: 2 });
  });
});
