import { describe, it, expect } from 'vitest';
import { normalizeTimestamp, isServerNewer } from './vaultVersion';

describe('normalizeTimestamp', () => {
  it('ISO 文字列', () => {
    expect(normalizeTimestamp('2026-08-31T10:00:00.000Z')).toBe(Date.parse('2026-08-31T10:00:00Z'));
  });
  it('BigQuery の {value} 形式', () => {
    expect(normalizeTimestamp({ value: '2026-08-31T10:00:00Z' })).toBe(
      Date.parse('2026-08-31T10:00:00Z'),
    );
  });
  it('null / 空 は NaN', () => {
    expect(normalizeTimestamp(null)).toBeNaN();
    expect(normalizeTimestamp('')).toBeNaN();
  });
});

describe('isServerNewer', () => {
  it('サーバーが新しい → true', () => {
    expect(isServerNewer('2026-08-31T10:00:00Z', '2026-08-31T10:05:00Z')).toBe(true);
  });
  it('同じ → false', () => {
    expect(isServerNewer('2026-08-31T10:00:00Z', '2026-08-31T10:00:00Z')).toBe(false);
  });
  it('クライアントの方が新しい（あり得ないが）→ false', () => {
    expect(isServerNewer('2026-08-31T10:05:00Z', '2026-08-31T10:00:00Z')).toBe(false);
  });
  it('形式混在（文字列 vs {value}）でも比較できる', () => {
    expect(isServerNewer('2026-08-31T10:00:00Z', { value: '2026-08-31T10:05:00Z' })).toBe(true);
  });
  it('base が空なら衝突なし扱い（初回保存など）', () => {
    expect(isServerNewer('', '2026-08-31T10:05:00Z')).toBe(false);
  });
  it('パース不能でも衝突なし扱い', () => {
    expect(isServerNewer('garbage', '2026-08-31T10:05:00Z')).toBe(false);
  });
});
