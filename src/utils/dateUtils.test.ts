import { describe, it, expect } from 'vitest';
import { parseRange, formatDateRangeJapanese, computeDateRange } from './dateUtils';

describe('parseRange', () => {
  it.each([
    ['+3d', { sign: '+', value: 3, unit: 'd' }],
    ['-2w', { sign: '-', value: 2, unit: 'w' }],
    ['+-1m', { sign: '+-', value: 1, unit: 'm' }],
    ['@7d', { sign: '@', value: 7, unit: 'd' }],
    ['+10y', { sign: '+', value: 10, unit: 'y' }],
  ])('%s を構造化する', (input, expected) => {
    expect(parseRange(input)).toEqual(expected);
  });

  it.each(['', 'abc', '3days', '+3', 'd3', '++3d'])('不正な %s は null', (input) => {
    expect(parseRange(input)).toBeNull();
  });
});

describe('formatDateRangeJapanese', () => {
  it('前後・単位を日本語にする', () => {
    expect(formatDateRangeJapanese('2024-05-01', '+-2w')).toBe('2024-05-01の前後2週分');
    expect(formatDateRangeJapanese('2024-05-01', '+3d')).toBe('2024-05-01の後3日分');
    expect(formatDateRangeJapanese('2024-05-01', '-1m')).toBe('2024-05-01の前1月分');
  });

  it('日付未指定は「今」を基準ラベルにする', () => {
    expect(formatDateRangeJapanese('', '+1y')).toBe('今の後1年分');
  });

  it('range が不正なら基準ラベルのみ返す', () => {
    expect(formatDateRangeJapanese('2024-05-01', 'xxx')).toBe('2024-05-01');
  });
});

describe('computeDateRange（タイムゾーン非依存の経路のみ）', () => {
  // 注: `+Nd` 等の日付シフト経路は toISOString() を経由するため実行環境の TZ に
  // 依存する（CI=UTC / ローカル=JST で1日ずれる）。ここでは非シフト経路のみ検証し、
  // シフト経路のテストは将来 TZ を UTC に固定してから追加する。
  it('range 空なら dateStr をそのまま from/to にする', () => {
    expect(computeDateRange('2024-05-01', '')).toEqual({ from: '2024-05-01', to: '2024-05-01' });
  });

  it('range が不正でも dateStr をそのまま from/to にする', () => {
    expect(computeDateRange('2024-05-01', 'garbage')).toEqual({
      from: '2024-05-01',
      to: '2024-05-01',
    });
  });

  it('dateStr も range も無ければ null', () => {
    expect(computeDateRange('', '')).toBeNull();
  });
});
