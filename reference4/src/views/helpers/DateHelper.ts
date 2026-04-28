/**
 * DateHelper.ts
 * 日付・ID 関連のユーティリティ関数。
 *
 * ID 形式: "yyyy-MM-dd-HHmmss"（例: "2026-04-19-091500"）
 * TTObject.UpdateDate / TTDataItem.ID にこの形式を使用する。
 */

/** 現在日時を ID 形式文字列で返す */
export function getNowId(): string {
  return dateToId(new Date());
}

/** Date を ID 形式文字列に変換 */
export function dateToId(date: Date): string {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const dd   = String(date.getDate()).padStart(2, '0');
  const hh   = String(date.getHours()).padStart(2, '0');
  const min  = String(date.getMinutes()).padStart(2, '0');
  const ss   = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
}

/** ID 形式文字列を Date に変換（パース失敗時は null）*/
export function idToDate(id: string): Date | null {
  const m = id.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, yyyy, mo, dd, hh, min, ss] = m;
  const d = new Date(+yyyy, +mo - 1, +dd, +hh, +min, +ss);
  return isNaN(d.getTime()) ? null : d;
}

/** ID 文字列から日付部分のみ抽出（"yyyy-MM-dd"）*/
export function idToDateString(id: string): string {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/** 2 つの ID が同日かどうかを判定 */
export function isSameDate(id1: string, id2: string): boolean {
  return idToDateString(id1) === idToDateString(id2);
}

/** ID を人間向け表示文字列に変換（例: "2026-04-19 09:15"）*/
export function idToDisplay(id: string): string {
  const d = idToDate(id);
  if (!d) return id;
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
