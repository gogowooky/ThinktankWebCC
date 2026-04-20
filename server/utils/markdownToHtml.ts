/**
 * markdownToHtml - Markdown → HTML 変換 (サーバーサイド)
 *
 * marked ライブラリを使用。GFM (GitHub Flavored Markdown) に対応。
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
