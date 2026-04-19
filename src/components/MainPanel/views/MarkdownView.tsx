/**
 * MarkdownView.tsx
 * Markdown レンダリングビュー。
 *
 * Phase 8:
 * - markdownToHtml() で変換した HTML を dangerouslySetInnerHTML で表示
 * - [Memo:ID] リンクのクリックをイベント委譲でインターセプト
 * - item.Content 変化を購読して再レンダー
 * Phase 13 以降: IsMetaOnly=true のスピナー対応
 */

import React, { useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import { markdownToHtml } from '../../../utils/markdownToHtml';
import type { TTTab } from '../../../views/TTTab';
import './MarkdownView.css';

interface Props {
  tab: TTTab;
}

export function MarkdownView({ tab }: Props) {
  const app  = TTApplication.Instance;
  const item = app.Models.Memos.GetDataItem(tab.ResourceID) ?? null;

  // item の Content 変化（他コンポーネントからの編集）を購読
  if (item) useAppUpdate(item);  // eslint-disable-line react-hooks/rules-of-hooks

  // Markdown → HTML 変換（Content が変わったときだけ再計算）
  const html = useMemo(() => {
    if (!item) return '';
    return markdownToHtml(item.Content, {
      getTitle: (id) => {
        const linked = app.Models.Memos.GetDataItem(id);
        return linked?.Name ?? id;
      },
    });
  }, [item, item?.Content, app.Models.Memos]);  // eslint-disable-line react-hooks/exhaustive-deps

  // [Memo:ID] リンクのクリックをイベント委譲で処理
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const link = target.closest<HTMLAnchorElement>('a.md-memo-link');
      if (!link) return;
      e.preventDefault();
      const memoId = link.dataset.memoId;
      if (memoId) app.OpenItem(memoId, 'texteditor');
    },
    [app]
  );

  // ── ローディング状態 ─────────────────────────────────────────────

  if (tab.IsLoading) {
    return (
      <div className="markdown-view markdown-view--loading">
        <Loader2 className="markdown-view__spinner" size={28} />
        <p className="markdown-view__loading-text">コンテンツを読み込み中...</p>
      </div>
    );
  }

  // ── Markdown レンダリング ────────────────────────────────────────

  return (
    <div
      className="markdown-view"
      onClick={handleClick}
    >
      <div
        className="markdown-view__body"
        // コンテンツはユーザー自身が入力したメモのみ（外部入力なし）
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
