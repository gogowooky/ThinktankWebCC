// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  normalizeKeyName,
  normalizeKeyStr,
  parseMultiKey,
  keyEventToStr,
  mouseEventToStr,
  wheelEventToStr,
  dragEventToStr,
  currentModStr,
} from './keyboardUtils';

describe('normalizeKeyName', () => {
  it('別名を正規化する', () => {
    expect(normalizeKeyName('up')).toBe('arrowup');
    expect(normalizeKeyName('DownArrow')).toBe('arrowdown');
    expect(normalizeKeyName('ESC')).toBe('escape');
  });

  it('その他は小文字化のみ', () => {
    expect(normalizeKeyName('A')).toBe('a');
    expect(normalizeKeyName('F5')).toBe('f5');
  });
});

describe('normalizeKeyStr', () => {
  it('修飾キーを ctrl→alt→shift→meta の順に並べる', () => {
    expect(normalizeKeyStr('Shift+Ctrl+A')).toBe('ctrl+shift+a');
    expect(normalizeKeyStr('meta+alt+n')).toBe('alt+meta+n');
  });

  it('空白と別名を吸収する', () => {
    expect(normalizeKeyStr('alt + up')).toBe('alt+arrowup');
  });
});

describe('parseMultiKey', () => {
  it('| 区切りで複数キーに分割する', () => {
    expect(parseMultiKey('ctrl+z|ctrl+y')).toEqual(['ctrl+z', 'ctrl+y']);
  });

  it('\\| でエスケープしたリテラルの | を1キーとして扱う', () => {
    expect(parseMultiKey('ctrl+\\|')).toEqual(['ctrl+|']);
  });

  it('空要素は捨てる', () => {
    expect(parseMultiKey('ctrl+z||ctrl+y|')).toEqual(['ctrl+z', 'ctrl+y']);
  });
});

describe('keyEventToStr', () => {
  it('修飾キー単独は null', () => {
    for (const key of ['Control', 'Alt', 'Shift', 'Meta']) {
      expect(keyEventToStr(new KeyboardEvent('keydown', { key }))).toBeNull();
    }
  });

  it('修飾 + キーを組み立てる', () => {
    expect(keyEventToStr(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }))).toBe('ctrl+n');
    expect(
      keyEventToStr(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, shiftKey: true })),
    ).toBe('alt+shift+arrowup');
  });
});

describe('mouseEventToStr / wheelEventToStr / dragEventToStr', () => {
  it('ダブルクリック・右クリック', () => {
    expect(mouseEventToStr('dblclick', new MouseEvent('dblclick'))).toBe('left2');
    expect(mouseEventToStr('contextmenu', new MouseEvent('contextmenu', { ctrlKey: true }))).toBe(
      'ctrl+right1',
    );
  });

  it('ホイール方向', () => {
    expect(wheelEventToStr(new WheelEvent('wheel', { deltaY: -5 }))).toBe('wheelup');
    expect(wheelEventToStr(new WheelEvent('wheel', { deltaY: 5 }))).toBe('wheeldown');
  });

  it('D&D 疑似キーは修飾 + 種別名を小文字化', () => {
    expect(
      dragEventToStr('ThinkFileDrag', {
        ctrlKey: false,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe('alt+thinkfiledrag');
  });
});

describe('currentModStr', () => {
  it('押下中の修飾キーを返し、無ければ "-"', () => {
    expect(currentModStr(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true }))).toBe(
      'ctrl+shift',
    );
    expect(currentModStr(new KeyboardEvent('keydown', {}))).toBe('-');
  });
});
