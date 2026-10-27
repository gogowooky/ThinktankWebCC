import { describe, expect, it } from 'vitest';
import {
  buildRegexFromWords,
  buildWordPattern,
  splitHighlighterGroups,
  splitHighlighterWords
} from './highlighterPattern';

describe('highlighterPattern', () => {
  it('splits words by half-width and full-width spaces', () => {
    const input = 'hello　world   foo　bar';
    expect(splitHighlighterWords(input)).toEqual(['hello', 'world', 'foo', 'bar']);
  });

  it('splits up to 5 groups by comma', () => {
    const input = 'g1, g2, g3, g4, g5, g6';
    expect(splitHighlighterGroups(input)).toHaveLength(5);
  });

  it('expands alphanumeric characters when matchWidth is false', () => {
    expect(buildWordPattern('1', { matchWidth: false })).toBe('[1１]');
    expect(buildWordPattern('１', { matchWidth: false })).toBe('[1１]');

    const patA = buildWordPattern('a', { matchWidth: false, matchCase: false });
    expect(patA).toBe('[aAａＡ]');

    const testMatch = (str: string, options: any) => {
      const reg = buildRegexFromWords(['a'], options);
      return reg ? reg.test(str) : false;
    };

    expect(testMatch('a', { matchWidth: false, matchCase: false })).toBe(true);
    expect(testMatch('A', { matchWidth: false, matchCase: false })).toBe(true);
    expect(testMatch('ａ', { matchWidth: false, matchCase: false })).toBe(true);
    expect(testMatch('Ａ', { matchWidth: false, matchCase: false })).toBe(true);
    expect(testMatch('b', { matchWidth: false, matchCase: false })).toBe(false);
  });

  it('respects matchCase: true', () => {
    const testMatch = (str: string, options: any) => {
      const reg = buildRegexFromWords(['a'], options);
      return reg ? reg.test(str) : false;
    };

    expect(testMatch('a', { matchWidth: false, matchCase: true })).toBe(true);
    expect(testMatch('ａ', { matchWidth: false, matchCase: true })).toBe(true);
    // 大文字にはマッチしない
    expect(testMatch('A', { matchWidth: false, matchCase: true })).toBe(false);
    expect(testMatch('Ａ', { matchWidth: false, matchCase: true })).toBe(false);
  });

  it('respects matchWidth: true (distinguishes half and full width)', () => {
    const testMatch = (str: string, options: any) => {
      const reg = buildRegexFromWords(['a'], options);
      return reg ? reg.test(str) : false;
    };

    expect(testMatch('a', { matchWidth: true, matchCase: false })).toBe(true);
    expect(testMatch('A', { matchWidth: true, matchCase: false })).toBe(true);
    // 全角にはマッチしない
    expect(testMatch('ａ', { matchWidth: true, matchCase: false })).toBe(false);
    expect(testMatch('Ａ', { matchWidth: true, matchCase: false })).toBe(false);
  });

  it('supports regex mode when isRegex is true', () => {
    const reg = buildRegexFromWords(['\\d+'], { isRegex: true, matchCase: false });
    expect(reg?.test('123')).toBe(true);
    expect(reg?.test('abc')).toBe(false);
  });

  it('handles invalid regex gracefully', () => {
    const reg = buildRegexFromWords(['(?+['], { isRegex: true, matchCase: false });
    expect(reg).toBeNull();
  });
});
