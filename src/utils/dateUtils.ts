/**
 * dateUtils.ts
 * 日付範囲の解析・計算・フォーマットユーティリティ
 */

export type RangeSign = '+' | '-' | '+-' | '@';
export type RangeUnit = 'y' | 'm' | 'w' | 'd';

export interface ParsedRange { sign: RangeSign; value: number; unit: RangeUnit; }

export function parseRange(s: string): ParsedRange | null {
  const m = s.match(/^(\+\-|\+|\-|@)(\d+)([ymwd])$/);
  if (!m) return null;
  return { sign: m[1] as RangeSign, value: parseInt(m[2], 10), unit: m[3] as RangeUnit };
}

export function shiftDate(base: Date, delta: number, unit: RangeUnit): Date {
  const d = new Date(base);
  if (unit === 'y') d.setFullYear(d.getFullYear() + delta);
  else if (unit === 'm') d.setMonth(d.getMonth() + delta);
  else if (unit === 'w') d.setDate(d.getDate() + delta * 7);
  else d.setDate(d.getDate() + delta);
  return d;
}

export function toStr(d: Date): string { return d.toISOString().slice(0, 10); }

export function computeDateRange(dateStr: string, rangeStr: string): { from: string; to: string } | null {
  const trimmed = rangeStr.trim();
  const r = parseRange(trimmed);
  // @N{unit}: 現在日を起点に N 単位遡り。dateStr は無視。
  if (r?.sign === '@') {
    const now = new Date();
    return { from: toStr(shiftDate(now, -r.value, r.unit)), to: toStr(now) };
  }
  if (!dateStr) return null;
  const base = new Date(dateStr + 'T00:00:00');
  if (!trimmed) return { from: dateStr, to: dateStr };
  if (!r) return { from: dateStr, to: dateStr };
  if (r.sign === '+')  return { from: dateStr, to: toStr(shiftDate(base,  r.value, r.unit)) };
  if (r.sign === '-')  return { from: toStr(shiftDate(base, -r.value, r.unit)), to: dateStr };
  return {
    from: toStr(shiftDate(base, -r.value, r.unit)),
    to:   toStr(shiftDate(base,  r.value, r.unit)),
  };
}

/**
 * 日付範囲を日本語表現に変換する
 * 例: 「2024-05-01の前後2週間分」
 */
export function formatDateRangeJapanese(dateStr: string, rangeStr: string): string {
  const r = parseRange(rangeStr.trim());
  const baseLabel = dateStr || '今';
  if (!r) return baseLabel;

  const unitMap: Record<RangeUnit, string> = { y: '年', m: '月', w: '週', d: '日' };
  const signMap: Record<RangeSign, string> = { '+': '後', '-': '前', '+-': '前後', '@': '前' };
  
  return `${baseLabel}の${signMap[r.sign]}${r.value}${unitMap[r.unit]}分`;
}
