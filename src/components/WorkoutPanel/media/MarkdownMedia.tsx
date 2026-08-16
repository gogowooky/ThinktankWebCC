/**
 * MarkdownMedia.tsx
 * Markdown レンダリング表示メディア。
 *
 * - marked + marked-highlight + highlight.js で変換
 * - h1=ゴールド / h2=ブルー / h3=グリーン
 * - コードブロックにシンタックスハイライト
 * - 見出し単位で折り畳み。折り畳み状態は think.Metadata.editor.closedHeadings を
 *   TextEditorMedia（Monaco）と共有するため、ビューを切り替えても畳んだ位置が保たれる
 * - 読み取り専用（編集は TextEditorMedia）
 */

import { useEffect, useState, forwardRef, useImperativeHandle, useRef } from 'react';
import { renderMarkdownSections } from '../../../utils/markdownSanitize';
import { editorLineOffset, parseClosedHeadings, serializeClosedHeadings } from '../../../utils/markdownSections';
import { injectInlineStyleCss } from '../../../utils/defaultColor';
import type { MediaProps } from './types';
import './MarkdownMedia.css';

export interface MarkdownMediaRef { focus: () => void; }

export const MarkdownMedia = forwardRef<MarkdownMediaRef, MediaProps>(function MarkdownMedia({ think, editorSettings }: MediaProps, ref) {
  const [html, setHtml] = useState('');
  const mdRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = mdRef.current;
      if (!el) return;
      el.focus();
      // 先頭要素が <details> だと文書全体が選択されてしまうため、見出し（summary の中身）まで降りる
      let first = el.firstElementChild;
      while (first && (first.tagName === 'DETAILS' || first.classList.contains('md-section-body'))) {
        first = first.firstElementChild;
      }
      if (!first) return;
      const range = document.createRange();
      range.selectNodeContents(first);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    },
  }));

  // TextEditor ペインが開いていなくても書式が効くよう、こちらでも注入する
  // （同じスタイルシートを共有するので、両方開いていても二重にはならない）
  useEffect(() => {
    injectInlineStyleCss(editorSettings?.inlineStyles);
  }, [editorSettings?.inlineStyles]);

  useEffect(() => {
    if (!think) { setHtml(''); return; }
    const body = (think.Content ?? '').replace(/^[^\n]*\n?/, '');

    // closedHeadings はエディタ値の行番号なので、本文のみを描画するこちらの行番号へ戻す
    const offset = editorLineOffset(think.ContentType);
    const closedSourceLines = new Set(
      [...parseClosedHeadings(think.Metadata?.editor?.closedHeadings)].map((line) => line - offset),
    );

    // 折り畳み状態を織り込んだ HTML を一度に流し込む。後から DOM を畳むと
    // スクロール位置の復元が畳む前の高さを基準にしてしまうため。
    let cancelled = false;
    // renderMarkdownSections 内で DOMPurify によるサニタイズ済み
    renderMarkdownSections(body, closedSourceLines, offset).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [think?.ID, think?.Content]);

  // <details> の開閉を closedHeadings へ書き戻す（エディタ側の折り畳みと同じキー）
  useEffect(() => {
    const el = mdRef.current;
    if (!el || !think) return;

    const handleToggle = () => {
      const closed = new Set<number>();
      const known = new Set<number>();
      el.querySelectorAll<HTMLDetailsElement>('details.md-section[data-tt-line]').forEach((details) => {
        const line = Number(details.dataset.ttLine);
        if (!Number.isFinite(line)) return;
        known.add(line);
        if (!details.open) closed.add(line);
      });

      // このビューに存在しない見出しの折り畳みは、エディタ側だけが持つ状態（タイトル行など）。
      // こちらの DOM から再構築すると消えてしまうので引き継ぐ。
      for (const line of parseClosedHeadings(think.Metadata?.editor?.closedHeadings)) {
        if (!known.has(line)) closed.add(line);
      }

      if (!think.Metadata) think.Metadata = {};
      think.Metadata.editor = {
        ...(think.Metadata.editor ?? {}),
        closedHeadings: serializeClosedHeadings(closed),
      };
    };

    // toggle はバブルしないため capture 段階で受ける
    el.addEventListener('toggle', handleToggle, true);
    return () => el.removeEventListener('toggle', handleToggle, true);
  }, [think]);

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
      // biome-ignore lint/security/noDangerouslySetInnerHtml: setHtml 前に DOMPurify を通している
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
