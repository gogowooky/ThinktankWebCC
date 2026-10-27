

export const ROWNUM_WIDTH = 40;

const AUTO_CHAR_W = 7;

const AUTO_MIN_W = 60;

const AUTO_CAP_CHARS = 40;

export function calcColumnWidth(col: string, rows: string[][], colIdx: number): number {
  const headerLen = col.length;
  const maxDataLen = rows.reduce((max, row) => Math.max(max, (row[colIdx] ?? '').length), 0);
  const effLen = Math.max(headerLen, Math.min(maxDataLen, AUTO_CAP_CHARS));
  return Math.max(AUTO_MIN_W, effLen * AUTO_CHAR_W + 28); // +28: ソートアイコン+パディング
}
