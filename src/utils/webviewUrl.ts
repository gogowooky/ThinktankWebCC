/**
 * webviewUrl.ts
 * WebView URL フォーマットユーティリティ
 *
 * 内部ルーティング用URLを生成・解析する。
 * ブラウザのアドレスバーにコピペ可能な形式。
 *
 * フォーマット:
 *   /view/{viewType}?{params}
 *
 * 現在サポートするviewType:
 *   markdown  - Markdownプレビュー (?category=Memos&id={id})
 *
 * 将来の拡張例:
 *   /view/chat?session={id}
 *   /view/search?q={keyword}&category={cat}
 *   /view/related?id={id}
 *   /view/calendar?date=2026-04-04
 *   /view/file?id={id}
 */

export interface ViewRoute {
  viewType: string;
  params: Record<string, string>;
}

/**
 * 内部ビューURLを生成
 */
export function buildViewUrl(viewType: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return `/view/${viewType}${query ? '?' + query : ''}`;
}

/**
 * Markdown プレビューURLを生成
 */
export function buildMarkdownUrl(category: string, id: string): string {
  return buildViewUrl('markdown', { category, id });
}

/**
 * チャットURLを生成
 */
export function buildChatUrl(sessionId: string): string {
  return buildViewUrl('chat', { session: sessionId });
}

/**
 * URLを解析してViewRouteを返す。
 * 内部ビューURL (/view/...) でない場合は null。
 */
export function parseViewUrl(url: string): ViewRoute | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith('/view/')) return null;

  try {
    // /view/{viewType}?{params} を解析
    const withoutPrefix = trimmed.slice(6); // "/view/" を除去
    const qIndex = withoutPrefix.indexOf('?');
    const viewType = qIndex >= 0 ? withoutPrefix.slice(0, qIndex) : withoutPrefix;
    const queryStr = qIndex >= 0 ? withoutPrefix.slice(qIndex + 1) : '';

    const params: Record<string, string> = {};
    if (queryStr) {
      const sp = new URLSearchParams(queryStr);
      sp.forEach((value, key) => { params[key] = value; });
    }

    return { viewType, params };
  } catch {
    return null;
  }
}

/**
 * URLが外部URL (http/https) かどうか
 */
export function isExternalUrl(url: string): boolean {
  const t = url.trim();
  return t.startsWith('http://') || t.startsWith('https://');
}

/**
 * 表示用URLをフルURLに変換（ブラウザで開く用）
 * 内部URL: origin + path
 * 外部URL: そのまま
 */
export function toFullUrl(url: string): string {
  const t = url.trim();
  if (isExternalUrl(t)) return t;
  if (t.startsWith('/')) return `${window.location.origin}${t}`;
  return t;
}

/**
 * アドレスバーに表示する短縮形
 * 外部URL: そのまま
 * 内部URL: /view/... 部分のみ
 */
export function toDisplayUrl(url: string): string {
  const t = url.trim();
  if (isExternalUrl(t)) return t;
  return t;
}

