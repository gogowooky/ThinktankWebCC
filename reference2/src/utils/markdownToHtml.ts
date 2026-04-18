/**
 * markdownToHtml - Markdown → HTML 変換
 *
 * marked ライブラリを使用。GFM (GitHub Flavored Markdown) に対応:
 * - 見出し (h1-h6)、段落、改行
 * - 太字、斜体、取り消し線、インラインコード
 * - コードブロック（言語指定付き）
 * - 順序付き/なしリスト（ネスト対応）
 * - テーブル (GFM)
 * - リンク、画像
 * - 引用ブロック (blockquote)
 * - 水平線
 */

import { marked } from 'marked';

// カスタムレンダラー: 外部リンクを新しいタブで開く
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    link({ href, title, text }: { href: string; title?: string | null; text: string }): string {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

export function markdownToHtml(md: string): string {
  if (!md) return '';
  const result = marked.parse(md);
  return typeof result === 'string' ? result : '';
}
