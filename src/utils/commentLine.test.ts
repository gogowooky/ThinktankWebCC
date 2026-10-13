import { describe, expect, it } from 'vitest';
import { isCommentLine } from './commentLine';
import { parseTableContent } from './tableFormat';
import { parseDefaultColor } from './defaultColor';
import { parseSearchTagContent } from './searchTagFormat';

describe('Default*.md common comment rule', () => {
  it('treats # ; > | as comments even after leading spaces', () => {
    for (const line of ['# a', '; a', '> a', '| a', '  ; a', '\t| a']) expect(isCommentLine(line)).toBe(true);
    for (const line of ['a # b', 'Ctrl+;', '']) expect(isCommentLine(line)).toBe(false);
  });

  it('DefaultShortcut.md (table): first > line is the header, later > lines and indented ; lines are comments', () => {
    const [section] = parseTableContent('title\n  > focus,key,action\n*,Ctrl+A,A.B\n  ; *,Ctrl+B,C.D\n| memo\n> another');
    expect(section.columns).toEqual(['focus', 'key', 'action']);
    expect(section.rows).toEqual([['*', 'Ctrl+A', 'A.B']]);
  });

  it('DefaultColor.md: | lines are comments too', () => {
    expect(parseDefaultColor('| note\n; note\nTextEditor.Bold, undefined, undefined, bold').map(e => e.statusId))
      .toEqual(['TextEditor.Bold']);
  });

  it('DefaultSearchTag.md: ; > | lines are comments, not tags', () => {
    expect(parseSearchTagContent('; Old, "x", NoURL\n> Old2, "y", NoURL\n| Old3, "z", NoURL\nGoogle, "検索", https://g/?q={0}')
      .map(r => r.id)).toEqual(['Google']);
  });
});
