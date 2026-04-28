/**
 * MarkdownView.tsx
 * Markdown レンダリングビュー。
 *
 * Phase 8:
 * - markdownToHtml() で変換した HTML を dangerouslySetInnerHTML で表示
 * - [Memo:ID] リンクのクリックをイベント委譲でインターセプト
 * - item の Content 変化を購読して再レンダー
 *   （useAppUpdate を条件分岐の外で呼ぶため MarkdownBody サブコンポーネントに分離）
 * Phase 13 以降: IsMetaOnly=true のスピナー対応
 */

import React, { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import { markdownToHtml } from '../../../utils/markdownToHtml';
import type { TTDataItem } from '../../../models/TTDataItem';
import type { TTTab } from '../../../views/TTTab';
import './MarkdownView.css';

// ── MarkdownBody（item が存在する場合のみマウントされる） ────────────

interface BodyProps {
  item: TTDataItem;
  onMemoClick: (id: string) => void;
}

function MarkdownBody({ item, onMemoClick }: BodyProps) {
  // item.Content が変化したら再レンダー（hooks を常に呼ぶ）
  useAppUpdate(item);

  const app = TTApplication.Instance;

  const html = markdownToHtml(item.Content, {
    getTitle: (id) => app.Models.Memos.GetDataItem(id)?.Name ?? id,
  });

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.md-memo-link');
    if (!link) return;
    e.preventDefault();
    const memoId = link.dataset.memoId;
    if (memoId) onMemoClick(memoId);
  };

  return (
    <div
      className="markdown-view__body"
      onClick={handleClick}
      // コンテンツはユーザー自身が入力したメモのみ（外部入力なし）
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── MarkdownView 本体 ─────────────────────────────────────────────────

interface Props {
  tab: TTTab;
}

export function MarkdownView({ tab }: Props) {
  const app  = TTApplication.Instance;
  const item = app.Models.Memos.GetDataItem(tab.ResourceID) ?? null;

  const handleMemoClick = useCallback(
    (id: string) => app.OpenItem(id, 'texteditor'),
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

  // ── Markdown レンダリング ─────────────────────────────────────────

  return (
    <div className="markdown-view">
      {item ? (
        <MarkdownBody item={item} onMemoClick={handleMemoClick} />
      ) : (
        <p className="markdown-view__empty">コンテンツが見つかりません</p>
      )}
    </div>
  );
}
