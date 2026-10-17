/**
 * tagInsertMenu.ts
 * docs/DefaultSearchTag.md のタグ項目（id と Description）と、Vault メモ（ThinktankSearchTag）による上書きを持つ。
 *
 * 「タグ挿入」メニューの表示は docs/DefaultMenu.md から作る汎用ルーチン（defaultMenu.ts）に移った。
 * ここに残るのは TextEditor.SearchTag.Load / Reset / Save が扱うタグ定義の状態だけ。
 */
import type { SearchTagRow } from './searchTagFormat';
import { DEFAULT_SEARCH_TAG_ROWS } from './defaultSearchTags';

type TagItem = { id: string; description: string };

/** docs/DefaultSearchTag.md の基礎データ */
const _baseItems: TagItem[] = DEFAULT_SEARCH_TAG_ROWS.map(r => ({ id: r.id, description: r.description }));
/** Vaultメモ（ThinktankSearchTag）由来の上書き分。id一致分のみ _baseItems を置換する */
let _overrideItems: TagItem[] | null = null;

/** _baseItems に _overrideItems を id 一致で上書きマージした一覧を返す */
function mergedItems(): TagItem[] {
  if (!_overrideItems || _overrideItems.length === 0) return _baseItems;
  const map = new Map(_baseItems.map(item => [item.id, item]));
  for (const item of _overrideItems) map.set(item.id, item);
  return [...map.values()];
}

/**
 * Vaultメモ（ThinktankSearchTag）由来の行でタグ定義を上書きマージする
 * （idが一致する項目だけ置換し、それ以外は既定値のまま維持する）。
 */
export function applySearchTagItemsOverride(rows: SearchTagRow[]): void {
  _overrideItems = rows.map(r => ({ id: r.id, description: r.description }));
}

/** 現在有効なタグ項目（既定値に Vault メモの上書きを重ねたもの）。TextEditor.SearchTag.Save が書き戻す */
export async function getEffectiveSearchTagItems(): Promise<TagItem[]> {
  return mergedItems();
}

/** 上書きを解除し、既定値（docs/DefaultSearchTag.md）に戻す */
export function resetSearchTagItemsOverride(): void {
  _overrideItems = null;
}
