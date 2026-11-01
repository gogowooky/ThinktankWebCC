/**
 * lineDiff.ts
 * 2つの本文の行単位の差分（追加行・削除行だけ）。AI に渡す進捗・実績の材料に使う。
 */

export interface LineDiffResult {
  changed: boolean;
  /** 「+ 行」「- 行」を元の順に並べたもの */
  lines: string[];
}

// 共通部分を除いた残りの行数の積がこれを超えると、LCS をあきらめて全行の置き換えとして扱う
const MAX_LCS_CELLS = 4_000_000;

export function diffLines(before: string, after: string): LineDiffResult {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head
    && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  if (x.length === 0 && y.length === 0) return { changed: false, lines: [] };

  if (x.length * y.length > MAX_LCS_CELLS) {
    return { changed: true, lines: [...x.map(l => `- ${l}`), ...y.map(l => `+ ${l}`)] };
  }

  const n = x.length;
  const m = y.length;
  const width = m + 1;
  const lcs = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] = x[i] === y[j]
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { i++; j++; }
    else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) lines.push(`- ${x[i++]}`);
    else lines.push(`+ ${y[j++]}`);
  }
  while (i < n) lines.push(`- ${x[i++]}`);
  while (j < m) lines.push(`+ ${y[j++]}`);
  return { changed: true, lines };
}
