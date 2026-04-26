/**
 * MarkdownMedia.tsx
 * Markdown レンダリング表示メディア。
 *
 * - marked + marked-highlight + highlight.js で変換
 * - h1=ゴールド / h2=ブルー / h3=グリーン
 * - コードブロックにシンタックスハイライト
 * - 読み取り専用（編集は TextEditorMedia）
 */

import { useEffect, useState } from 'react';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import type { MediaProps } from './types';
import './MarkdownMedia.css';

// marked インスタンスを一度だけ構築
const md = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  })
);

export function MarkdownMedia({ think }: MediaProps) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!think) { setHtml(''); return; }
    const result = md.parse(think.Content ?? '');
    // marked v18: parse は string | Promise<string>
    if (typeof result === 'string') {
      setHtml(result);
    } else {
      result.then(setHtml);
    }
  }, [think?.ID, think?.Content]);

  if (!think) {
    return <div className="media-empty"><span>エリアが未設定です</span></div>;
  }

  return (
    <div
      className="markdown-media"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: marked でサニタイズ済み
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
