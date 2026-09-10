/**
 * bundleNames.ts
 * 「バンドル」列（値は思考支援の対象Bundle名）の表示とソートで同じ値を使うための対応表。
 */

import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';

/**
 * thinkID → 対象Bundle名 の対応表を一度だけ構築する。
 *
 * ソートのコンパレータは O(n log n) 回呼ばれるため、そこで supportRecord() を呼ぶと
 * 既定値約30項目のオブジェクトを比較ごとに生成してしまう。生成は O(n) の本関数に集約し、
 * 比較・描画側は Map.get だけで済ませる。
 */
export function buildBundleNames(vault: TTVault, thinks: TTThink[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const think of thinks) {
    const bundleId = think.Metadata?.['thoughtSupport']?.bundleId;
    if (typeof bundleId === 'string' && bundleId) {
      names.set(think.ID, vault.GetThink(bundleId)?.Name ?? bundleId);
    }
  }
  return names;
}
