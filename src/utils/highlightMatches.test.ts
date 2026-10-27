import { describe, expect, it, vi } from 'vitest';
import { findHighlightRanges, type HighlightEditor } from './highlightMatches';

describe('findHighlightRanges', () => {
  it('calls model.findMatches with built patterns', () => {
    const findMatches = vi.fn().mockReturnValue([
      { range: { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 10 } },
    ]);
    const editor = {
      getModel: () => ({ findMatches }),
    } as unknown as HighlightEditor;

    const ranges = findHighlightRanges(editor, 'test　sample', { matchCase: true, matchWidth: false });
    expect(ranges).toHaveLength(1);
    expect(findMatches).toHaveBeenCalledWith(
      expect.stringContaining('[tｔ]'), // test
      true,
      true,
      true, // matchCase
      null,
      false
    );
  });
});
