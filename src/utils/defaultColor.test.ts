import { describe, expect, it } from 'vitest';
import { FOLDING_HEADER_STATUS_ID, foldingHeaderStyleCss, getDefaultColorStyle, parseDefaultColor } from './defaultColor';

describe('DefaultColor selection / occurrence / folding header', () => {
  it('keeps the background color in Theme.Color', () => {
    expect(getDefaultColorStyle('TextEditor.Selection.Theme').Color).toBe('#cba8ff');
    expect(getDefaultColorStyle('TextEditor.Occurrence.Theme').Color).toBe('#ccffdd');
    expect(getDefaultColorStyle(FOLDING_HEADER_STATUS_ID).Color).toBe('#ffddff');
    expect(foldingHeaderStyleCss(getDefaultColorStyle(FOLDING_HEADER_STATUS_ID))).toContain('background-color: #ffddff');
  });

  it('reads an old-format memo by renaming the ID and swapping Color and BgColor', () => {
    expect(parseDefaultColor('TextEditor.Selection, undefined, #123456, bold\nTextEditor.Text, #000000, #ffffff, undefined')).toEqual([
      { statusId: 'TextEditor.Selection.Theme', style: { Color: '#123456', BgColor: 'undefined', Attrs: 'bold' } },
      { statusId: 'TextEditor.Text', style: { Color: '#000000', BgColor: '#ffffff', Attrs: 'undefined' } },
    ]);
  });
});
