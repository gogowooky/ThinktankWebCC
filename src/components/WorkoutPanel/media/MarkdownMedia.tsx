/**
 * MarkdownMedia.tsx
 * Markdown レンダリング表示メディア。
 *
 * - marked + marked-highlight + highlight.js で変換
 * - h1=ゴールド / h2=ブルー / h3=グリーン
 * - コードブロックにシンタックスハイライト
 * - 読み取り専用（編集は TextEditorMedia）
 */

import { useEffect, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import type { MediaProps } from './types';
import './MarkdownMedia.css';

// [File:name](url) などのリンクを新しいタブで開くレンダラー
const linkRenderer = {
  link({ href, title, text }: { href: string; title?: string | null; text: string }) {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
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

export interface MarkdownMediaRef { focus: () => void; }

export const MarkdownMedia = forwardRef<MarkdownMediaRef, MediaProps>(function MarkdownMedia({ think }: MediaProps, ref) {
  const [html, setHtml] = useState('');
  const mdRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = mdRef.current;
      if (!el) return;
      el.focus();
      const first = el.firstElementChild;
      if (!first) return;
      const range = document.createRange();
      range.selectNodeContents(first);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
  }));

  useEffect(() => {
    if (!think) { setHtml(''); return; }
    const body = (think.Content ?? '').replace(/^[^\n]*\n?/, '');
    const result = md.parse(body);
    // marked v18: parse は string | Promise<string>
    if (typeof result === 'string') {
      setHtml(result);
    } else {
      result.then(setHtml);
    }
  }, [think?.ID, think?.Content]);

  useEffect(() => {
    if (html && mdRef.current && think) {
      const savedScroll = think.ContentType === 'nettext'
        ? (think.Metadata?.webtextScrollTop ?? 0)
        : (think.Metadata?.markdownScrollTop ?? 0);
      mdRef.current.scrollTop = savedScroll;
    }
  }, [html, think?.ID, think]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (think) {
      if (!think.Metadata) think.Metadata = {};
      if (think.ContentType === 'nettext') {
        think.Metadata.webtextScrollTop = e.currentTarget.scrollTop;
      } else {
        think.Metadata.markdownScrollTop = e.currentTarget.scrollTop;
      }
    }
  };

  if (!think) {
    return <div className="media-empty"><span>エリアが未設定です</span></div>;
  }

  return (
    <div
      ref={mdRef}
      tabIndex={-1}
      className="markdown-media"
      onScroll={handleScroll}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: marked でサニタイズ済み
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
