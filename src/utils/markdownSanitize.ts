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
import { buildSectionTree, type MarkdownSection } from './markdownSections';

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

// 参照リンク定義（[label]: url）は文書のどこにあっても全体から参照できる。
// セクション単位に切り分けて描画すると定義が別チャンクに落ちてリンクが壊れるため、
// 全チャンクの末尾へ付け足す。重複定義は marked が先勝ちで無視し、描画結果には現れない。
const LINK_DEF_RE = /^\s{0,3}\[[^\]]+\]:\s*\S/;

/**
 * Markdown をセクション（見出し）単位の <details> で包んで描画する。
 *
 * closedSourceLines には折り畳んだ状態で描画したい見出し行（Markdown原文の1始まり行番号）を渡す。
 * lineOffset は data-tt-line に載せるエディタ行番号への変換値（markdownSections.editorLineOffset）。
 *
 * セクション境界は必ず見出し行なので、原文を行単位で切り出しても構文は壊れない
 * （collectHeadings がコードフェンス内の # を見出しとして拾わないため）。
 * ラッパー自体はここで組み立てる静的なマークアップで、埋め込む値は数値のみ。
 * 本文は各チャンクごとに renderMarkdown を通しており、サニタイズ経路は変わらない。
 */
export async function renderMarkdownSections(
  markdown: string,
  closedSourceLines: ReadonlySet<number>,
  lineOffset: number,
): Promise<string> {
  const lines = markdown.split('\n');
  const { sections, preambleEndLine } = buildSectionTree(markdown);

  const linkDefs = lines.filter((line) => LINK_DEF_RE.test(line));
  const linkDefSuffix = linkDefs.length > 0 ? `\n\n${linkDefs.join('\n')}` : '';

  const renderLines = async (from: number, to: number): Promise<string> => {
    if (to < from) return '';
    const chunk = lines.slice(from - 1, to).join('\n');
    if (chunk.trim() === '') return '';
    return await renderMarkdown(chunk + linkDefSuffix);
  };

  const renderSection = async (section: MarkdownSection): Promise<string> => {
    const headingHtml = await renderLines(section.startLine, section.startLine);

    // 中身のない見出しは Monaco 側でも折り畳み対象外なので <details> にしない
    if (section.endLine <= section.startLine) return headingHtml;

    const parts: string[] = [];
    let cursor = section.startLine + 1;
    for (const child of section.children) {
      parts.push(await renderLines(cursor, child.startLine - 1));
      parts.push(await renderSection(child));
      cursor = child.endLine + 1;
    }
    parts.push(await renderLines(cursor, section.endLine));

    const openAttr = closedSourceLines.has(section.startLine) ? '' : ' open';
    return (
      `<details class="md-section md-section-l${section.level}"` +
      ` data-tt-line="${section.startLine + lineOffset}"${openAttr}>` +
      `<summary class="md-section-summary">${headingHtml}</summary>` +
      `<div class="md-section-body">${parts.join('')}</div>` +
      `</details>`
    );
  };

  const html: string[] = [await renderLines(1, preambleEndLine)];
  for (const section of sections) {
    html.push(await renderSection(section));
  }
  return html.join('');
}
