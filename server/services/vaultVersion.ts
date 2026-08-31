/**
 * vaultVersion.ts
 * 楽観ロックの比較ロジック（PROJECT_REVIEW_REPORT.md D-2）。
 * BigQuery の TIMESTAMP は文字列か {value: string} で返るため正規化してから比較する。
 */

export function normalizeTimestamp(t: unknown): number {
  if (t == null) return NaN;
  if (typeof t === 'object' && t !== null && 'value' in t) {
    return new Date((t as { value: string }).value).getTime();
  }
  return new Date(String(t)).getTime();
}

/**
 * クライアントが読み込んだ時点の updatedAt（base）より、サーバーの現在の updatedAt が
 * 新しければ true（= 保存を弾くべき）。どちらかがパース不能なら「衝突なし」に倒す
 * （誤検出で保存できなくなる方が害が大きい）。
 */
export function isServerNewer(base: unknown, server: unknown): boolean {
  const b = normalizeTimestamp(base);
  const s = normalizeTimestamp(server);
  if (Number.isNaN(b) || Number.isNaN(s)) return false;
  return s > b;
}
