/**
 * markdownToHtml.ts
 * Markdown テキストを HTML 文字列に変換するユーティリティ。
 *
 * Phase 8:
 * - marked v18 を使用（parse() は同期でstring返却）
 * - [Memo:ID] タグ → <a data-memo-id="ID"> クリッカブルリンクに変換
 *   （前処理で memo://ID リンクに変換し、後処理で data-memo-id 属性付きに差し替え）
 * - コードブロック内の [Memo:ID] はそのまま保持
 */

import { parse } from 'marked';

// ── [Memo:ID] 前処理 ─────────────────────────────────────────────────

/**
 * `[Memo:someId]` を Markdown リンク記法 `[title](memo://someId)` に変換。
 * コードスパン（`...`）・コードブロック（```...```）内はスキップ。
 */
function preprocessMemoTags(
  text: string,
  getTitle: (id: string) => string
): string {
  const codeBlocks: string[] = [];

  // コードブロック・コードスパンを一時プレースホルダーに退避
  let processed = text.replace(/(```[\s\S]*?```|`[^`]+`)/g, (match) => {
    const idx = codeBlocks.push(match) - 1;
    return `\x00CODE${idx}\x00`;
  });

  // [Memo:ID] を Markdown リンクに変換
  processed = processed.replace(/\[Memo:([^\]]+)\]/g, (_full, id: string) => {
    const trimmedId = id.trim();
    const title = getTitle(trimmedId) || trimmedId;
    return `[${title}](memo://${trimmedId})`;
  });

  // プレースホルダーを元に戻す
  processed = processed.replace(
    /\x00CODE(\d+)\x00/g,
    (_m, i: string) => codeBlocks[Number(i)]
  );

  return processed;
}

// ── memo:// リンクの後処理 ───────────────────────────────────────────

/**
 * marked が生成した `<a href="memo://ID">text</a>` を
 * `<a class="md-memo-link" data-memo-id="ID" href="#">text</a>` に差し替える。
 * 外部リンクには target="_blank" を付与。
 */
function postprocessLinks(html: string): string {
  // memo:// リンク → data-memo-id 付きアンカー
  let result = html.replace(
    /<a href="memo:\/\/([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g,
    (_m, id: string, _attrs: string, text: string) =>
      `<a class="md-memo-link" data-memo-id="${id}" href="#">${text}</a>`
  );

  // 通常の外部リンク → 新タブ
  result = result.replace(
    /<a href="(https?:\/\/[^"]+)"([^>]*)>/g,
    (_m, href: string, attrs: string) =>
      `<a href="${href}"${attrs} target="_blank" rel="noopener noreferrer">`
  );

  return result;
}

// ── メイン変換関数 ────────────────────────────────────────────────────

export interface MarkdownToHtmlOptions {
  /** [Memo:ID] のタイトル解決関数（未指定時は ID をそのまま表示） */
  getTitle?: (id: string) => string;
}

/**
 * Markdown テキストを HTML 文字列に変換する。
 * @param markdown  変換元 Markdown テキスト
 * @param options   オプション（タイトル解決関数等）
 * @returns         変換後 HTML 文字列
 */
export function markdownToHtml(
  markdown: string,
  options: MarkdownToHtmlOptions = {}
): string {
  const { getTitle = (id: string) => id } = options;

  const preprocessed = preprocessMemoTags(markdown, getTitle);

  const raw = parse(preprocessed, {
    breaks: true,
    gfm: true,
  }) as string;

  return postprocessLinks(raw);
}
