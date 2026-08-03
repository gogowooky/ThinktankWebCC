/**
 * markdownSanitize.ts
 * Markdown → 安全な HTML への変換パイプライン。
 *
 * marked は「Markdown → HTML 変換器」であってサニタイザではない（sanitize オプションは
 * v5 で廃止済み）。生の <script> や onerror 属性はそのまま通過する。
 * ContentType='nettext' は Web から取り込んだ外部由来テキストであり、Electron では
 * preload の electronAPI（Vault の全読み書き・syncFromServer）に到達できてしまうため、
 * 描画前に必ずここを通す。
 *
 * 描画側（MarkdownMedia）から分離してあるのは、DOM 依存の挙動を単体で検証できるようにするため。
 */

import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

/** 属性値へ埋め込む前に HTML 特殊文字を無害化する */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 遷移を許可する URL スキーム */
const SAFE_LINK_SCHEME = /^(?:https?|mailto|tel):/i;

// [File:name](url) などのリンクを新しいタブで開くレンダラー。
// href / title を素の文字列連結で埋めると javascript: スキームや
// title="..." からの属性ブレイクアウトを許すため、両方を検証・エスケープする。
const linkRenderer = {
  link({ href, title, text }: { href: string; title?: string | null; text: string }) {
    const trimmed = (href ?? '').trim();
    const safeHref = SAFE_LINK_SCHEME.test(trimmed) ? escapeHtml(trimmed) : '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    // 許可スキーム外は遷移させず、リンク文言だけを残す
    if (!safeHref) return `<span${titleAttr}>${text}</span>`;
    return `<a href="${safeHref}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  },
};

// marked インスタンスを一度だけ構築
const md = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
  { renderer: linkRenderer },
);

// 生き残ったリンクに target/rel を付け直す。
//
// ALLOWED_URI_REGEXP を指定すると、DOMPurify 3.4.12 は ADD_ATTR で許可した target も、
// 既定で許可されるはずの rel も除去する（実測）。target が落ちると Electron では
// アプリのウィンドウ自体が外部サイトへ遷移してしまうため、サニタイズ後に付与する。
// DOMPurify のフックは after フェーズで走るので、この付与が再検査で消されることはない。
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** marked の生成結果を DOMPurify で無害化する */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // javascript:, data:, vbscript: 等を排除し、外部遷移は http(s)/mailto/tel に限定する
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
  });
}

/**
 * Markdown を描画可能な安全 HTML に変換する。
 * marked v18 の parse は string | Promise<string> を返すため両方を扱う。
 */
export function renderMarkdown(markdown: string): string | Promise<string> {
  const result = md.parse(markdown);
  return typeof result === 'string'
    ? sanitizeHtml(result)
    : result.then(sanitizeHtml);
}
