/**
 * searchTagUrls.ts
 * 検索タグ（[Google:語] など）の URL テンプレートと、GoogleRoute・YahooTransfer の URL の組み立て。
 * 既定値は docs/DefaultSearchTag.md、Vaultメモ（ThinktankSearchTag）の行で上書きできる。
 */
import { defaultSearchTagUrls } from './defaultSearchTags';
import type { SearchTagRow } from './searchTagFormat';

// ── 検索タグキャッシュ ────────────────────────────────────────────────────────
// Vaultメモ（ThinktankSearchTag）由来の上書き分。id一致分のみ既定値（docs/DefaultSearchTag.md）を置換する
let _overrideSearchTags: Record<string, string> | null = null;

async function getSearchTags(): Promise<Record<string, string>> {
  return { ...defaultSearchTagUrls(), ...(_overrideSearchTags ?? {}) };
}

/**
 * Vaultメモ（ThinktankSearchTag）由来の行で検索URLテンプレートを上書きマージする
 * （idが一致する項目だけ置換し、それ以外は既定値のまま維持する。NoURL行は除外）。
 */
export function applySearchTagUrlOverride(rows: SearchTagRow[]): void {
  _overrideSearchTags = Object.fromEntries(
    rows
      .filter(r => r.url && r.url !== 'NoURL')
      .map(r => [r.id.toLowerCase(), r.url])
  );
}

/** 現在有効な検索URLテンプレート（キーは小文字のタグID）。TextEditor.SearchTag.Save が書き戻す */
export function getEffectiveSearchTagUrls(): Promise<Record<string, string>> {
  return getSearchTags();
}

/** 上書きを解除し、既定値（docs/DefaultSearchTag.md）に戻す */
export function resetSearchTagUrlOverride(): void {
  _overrideSearchTags = null;
}

export type BuiltUrl = { url: string; label: string } | { error: string };

/** GoogleRoute（DefaultSearchTag.md では NoURL）の URL。引数は地点のカンマ区切り */
export function buildGoogleRouteUrl(arg: string): BuiltUrl {
  const places = arg.split(',').map(p => p.trim()).filter(Boolean);
  if (places.length < 2) return { error: '経由地は2つ以上指定してください' };
  const encoded = places.map(p => encodeURIComponent(p)).join('/');
  return { url: `https://www.google.com/maps/dir/${encoded}/`, label: places.join(' → ') };
}

/**
 * YahooTransfer（DefaultSearchTag.md では NoURL）の URL。
 * 引数は "key value" をカンマ区切りで並べる（例：from 東京駅,to 大阪駅,dep 10:00）。
 */
export function buildYahooTransferUrl(arg: string): BuiltUrl {
  const paramMap: Record<string, string> = {};
  arg.split(',').forEach(token => {
    const trimmed = token.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx < 0) return;
    const key = trimmed.slice(0, spaceIdx).trim().toLowerCase();
    const val = trimmed.slice(spaceIdx + 1).trim();
    if (['from', 'to', 'dep', 'arr', 'via'].includes(key) && val) paramMap[key] = val;
  });

  const { from = '', to = '', via = '', dep = '', arr = '' } = paramMap;
  if (!from || !to) return { error: 'YahooTransferには from と to が必要です（例：from 東京駅,to 大阪駅）' };

  const params = new URLSearchParams();
  params.set('from', from);
  params.set('to', to);
  if (via) params.set('via', via);

  // dep（出発時刻）と arr（到着時刻）が両方指定された場合は dep を優先する
  const timeStr = dep || arr;
  if (timeStr) {
    const [hh = '0', mm = '0'] = timeStr.split(':');
    const now = new Date();
    params.set('y', String(now.getFullYear()));
    params.set('m', String(now.getMonth() + 1));
    params.set('d', String(now.getDate()));
    params.set('hh', hh.padStart(2, '0'));
    const mmPad = mm.padStart(2, '0');
    params.set('m1', mmPad[0]);
    params.set('m2', mmPad[1]);
  }
  params.set('type', arr && !dep ? '4' : '1');

  return { url: `https://transit.yahoo.co.jp/search/result?${params.toString()}`, label: `${from} → ${to}` };
}

/**
 * 検索サイト ID と語から開く URL を作る（ToolBar.SearchMode.Text:Search 用）。
 * URL テンプレートは DoOnCursorPos:WebSearch:Open と同じもの（ThinktankSearchTag メモの上書きを含む）。
 */
export async function buildKeywordSearchUrl(searchId: string, word: string): Promise<BuiltUrl> {
  const id = searchId.trim().toLowerCase();
  if (id === 'googleroute') return buildGoogleRouteUrl(word);
  if (id === 'yahootransfer') return buildYahooTransferUrl(word);
  const template = (await getSearchTags())[id];
  if (!template) return { error: `検索サイト [${searchId}] のURLが見つかりません（docs/DefaultSearchTag.md）` };
  return { url: template.replace('{0}', encodeURIComponent(word)), label: `${searchId}:${word}` };
}
