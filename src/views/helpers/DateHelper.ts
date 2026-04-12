/**
 * DateHelper - 日付・ID関連のユーティリティ
 */

/**
 * 現在日時をID形式文字列で返す (yyyy-MM-dd-HHmmss)
 */
export function getNowId(): string {
  return dateToId(new Date());
}

/**
 * DateオブジェクトをID形式文字列に変換
 */
export function dateToId(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
}

/**
 * ID形式文字列からDateオブジェクトに変換
 * @param id "yyyy-MM-dd-HHmmss" 形式
 * @returns Date or null（パース失敗時）
 */
export function idToDate(id: string): Date | null {
  // 例: "2026-04-02-153000"
  const match = id.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;

  const [, yyyy, mm, dd, hh, min, ss] = match;
  const date = new Date(
    parseInt(yyyy), parseInt(mm) - 1, parseInt(dd),
    parseInt(hh), parseInt(min), parseInt(ss)
  );
  return isNaN(date.getTime()) ? null : date;
}

/**
 * ID文字列から日付部分のみを抽出 (yyyy-MM-dd)
 */
export function idToDateString(id: string): string {
  const match = id.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

/**
 * 2つのIDの日付が同日かどうかを判定
 */
export function isSameDate(id1: string, id2: string): boolean {
  return idToDateString(id1) === idToDateString(id2);
}
