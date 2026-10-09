import { describe, expect, it } from 'vitest';
import { parseHexColor, readableTextRgb, ribbonTextRgb } from './panelTheme';
import { getDefaultColorStyle } from './defaultColor';

const WHITE = '255 255 255';
const BLACK = '0 0 0';

describe('ribbon text color', () => {
  it('parses short, long and alpha hex forms', () => {
    expect(parseHexColor('#abc')).toEqual([0xaa, 0xbb, 0xcc]);
    expect(parseHexColor('#1d618f')).toEqual([0x1d, 0x61, 0x8f]);
    expect(parseHexColor('#1d618f80')).toEqual([0x1d, 0x61, 0x8f]);
    expect(parseHexColor('red')).toBeNull();
  });

  it('uses white on dark grounds and black on light grounds', () => {
    expect(readableTextRgb([0x2d, 0x2d, 0x2d])).toBe(WHITE);
    expect(readableTextRgb([0xff, 0xf3, 0xb0])).toBe(BLACK);
    expect(readableTextRgb([0xa8, 0xd8, 0xff])).toBe(BLACK);
  });

  it('keeps white text on every default panel theme, including the paler menu ribbon', () => {
    for (const kind of ['Thinktank', 'Seeds', 'Discuss', 'Harvest']) {
      expect(ribbonTextRgb(getDefaultColorStyle(`${kind}.Theme`))).toEqual({ ribbon: WHITE, soft: WHITE });
    }
  });

  it('judges the menu ribbon on the base color blended with the content background', () => {
    // 中間の明るさの基礎色: リボン本体は白文字、白で淡めたメニューリボンは黒文字
    expect(ribbonTextRgb({ Color: '#6a7f96', BgColor: '#ffffff', Attrs: 'undefined' }))
      .toEqual({ ribbon: WHITE, soft: BLACK });
  });

  it('falls back to the stylesheet default when the base color is unset or not hex', () => {
    expect(ribbonTextRgb({ Color: 'undefined', BgColor: '#ffffff', Attrs: 'undefined' })).toBeNull();
    expect(ribbonTextRgb({ Color: 'none', BgColor: '#ffffff', Attrs: 'undefined' })).toBeNull();
  });
});
