/**
 * defaultSearchTags.ts
 * docs/DefaultSearchTag.md をビルド時に取り込んだ既定の検索タグ。
 * Vault メモ（ThinktankSearchTag）による上書きは各利用側で重ねる。
 */
import defaultSearchTagContent from '../../docs/DefaultSearchTag.md?raw';
import { parseSearchTagContent, type SearchTagRow } from './searchTagFormat';

export const DEFAULT_SEARCH_TAG_ROWS: readonly SearchTagRow[] = parseSearchTagContent(defaultSearchTagContent);

/** 検索 URL テンプレート（キーは小文字の ID）。NoURL は WebSearch ではない ActionTag の印なので除く */
export function defaultSearchTagUrls(): Record<string, string> {
  return Object.fromEntries(
    DEFAULT_SEARCH_TAG_ROWS
      .filter(r => r.url && r.url !== 'NoURL')
      .map(r => [r.id.toLowerCase(), r.url]),
  );
}
