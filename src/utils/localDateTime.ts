/**
 * src/utils/localDateTime.ts
 * 保存されている更新日時（updatedAt）は UTC の ISO 文字列（例: 2026-10-19T01:27:34.363Z）なので、
 * そのまま切り出すと日本時間より 9 時間前の時刻・日付になり、「更新されていない」ように見える。
 * thinkid（作成日時）は端末のローカル時刻で付くので、表示と日付の絞り込みはローカル時刻に揃える。
 */

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function parseIso(value: string): Date | null {
  // thinkid 形式（2026-10-19-102734）など ISO でない値は、ローカル時刻の文字列としてそのまま扱う
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 更新日時をローカル時刻の "yyyy-MM-dd" にする。 */
export function toLocalDate(value: string): string {
  if (!value) return '';
  const d = parseIso(value);
  if (!d) return value.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 更新日時をローカル時刻の "yyyy-MM-dd-HHmmss"（thinkid と同じ形）にする。 */
export function toLocalStamp(value: string): string {
  if (!value) return '';
  const d = parseIso(value);
  if (!d) return value.length >= 17 ? value.slice(0, 17) : value;
  return `${toLocalDate(value)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
