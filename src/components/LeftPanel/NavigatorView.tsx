/**
 * NavigatorView.tsx
 * 左パネル - ナビゲーター。
 * Models.Memos のアイテム一覧を仮想スクロールで表示する。
 *
 * Phase 6: @tanstack/react-virtual による仮想スクロール + AND/OR/NOT フィルタ
 * Phase 13 以降: IsMetaOnly アイテムのオンデマンドロード
 * Phase 17 以降: TTKnowledge（Memo + Chat 統合）に切り替え
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  FileText, MessageCircle, Paperclip, Image,
  Mail, HardDrive, Link, File,
} from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { TTDataItem } from '../../models/TTDataItem';
import type { ContentType } from '../../types';
import './NavigatorView.css';

// ── ContentType アイコンマップ ────────────────────────────────────────

const CONTENT_ICONS: Record<ContentType, React.ReactNode> = {
  memo:   <FileText    size={13} />,
  chat:   <MessageCircle size={13} />,
  file:   <Paperclip   size={13} />,
  photo:  <Image       size={13} />,
  email:  <Mail        size={13} />,
  drive:  <HardDrive   size={13} />,
  url:    <Link        size={13} />,
};

function ContentIcon({ type }: { type: ContentType }) {
  return (
    <span className="nav-item__icon">
      {CONTENT_ICONS[type] ?? <File size={13} />}
    </span>
  );
}

// ── フィルタ解析 ─────────────────────────────────────────────────────

/**
 * AND / OR / NOT 構文のフィルタ文字列でアイテムを絞り込む。
 *
 * 構文例:
 *   "react"          → "react" を含む
 *   "react typescript" → "react" AND "typescript" を含む（スペース = AND）
 *   "react OR vue"   → "react" または "vue" を含む
 *   "react NOT test" → "react" を含み "test" を含まない
 */
function matchesFilter(item: TTDataItem, filter: string): boolean {
  if (!filter.trim()) return true;

  const text = `${item.Name} ${item.Keywords}`.toLowerCase();

  // OR 区切りで分割
  const orGroups = filter.split(/\bOR\b/i);

  return orGroups.some(group => {
    const tokens = group.trim().split(/\s+/).filter(Boolean);
    return tokens.every(token => {
      if (token.toUpperCase() === 'NOT') return true; // スキップ
      const notIdx = tokens.indexOf(token) - 1;
      const isNot = notIdx >= 0 && tokens[notIdx].toUpperCase() === 'NOT';
      return isNot ? !text.includes(token.toLowerCase()) : text.includes(token.toLowerCase());
    });
  });
}

/** UpdateDate 文字列（yyyy-MM-dd-HHmmss-mmm-rand）から表示用短縮形を生成 */
function formatDate(updateDate: string): string {
  // "2026-04-19-153639-634-kv4l" → "04/19"
  const parts = updateDate.split('-');
  if (parts.length >= 3) return `${parts[1]}/${parts[2]}`;
  return '';
}

// ── NavigatorView 本体 ───────────────────────────────────────────────

const ITEM_HEIGHT = 36; // px（各行の高さ）

export function NavigatorView() {
  const app = TTApplication.Instance;
  useAppUpdate(app.Models.Memos);
  useAppUpdate(app.LeftPanel);

  const lp = app.LeftPanel;
  const allItems = app.Models.Memos.GetDataItems();

  // フィルタ適用
  const filtered = useMemo(
    () => allItems.filter(item => matchesFilter(item, lp.Filter)),
    [allItems, lp.Filter]
  );

  // UpdateDate 降順でソート（新しい順）
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.UpdateDate.localeCompare(a.UpdateDate)),
    [filtered]
  );

  // 仮想スクロール
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  // クリックでアイテムを開く
  const handleClick = useCallback(
    (item: TTDataItem) => {
      app.OpenItem(item.ID, 'texteditor');
    },
    [app]
  );

  // フィルタ入力
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      lp.SetFilter(e.target.value);
    },
    [lp]
  );

  return (
    <div className="navigator">
      {/* フィルタ欄 */}
      <div className="navigator__filter">
        <input
          className="navigator__filter-input"
          type="text"
          placeholder="フィルタ（AND / OR / NOT）"
          value={lp.Filter}
          onChange={handleFilterChange}
        />
      </div>

      {/* アイテム数 */}
      <div className="navigator__count">
        {lp.Filter
          ? `${sorted.length} / ${allItems.length} 件`
          : `${allItems.length} 件`}
      </div>

      {/* リスト（仮想スクロール） */}
      <div className="navigator__list" ref={parentRef}>
        {sorted.length === 0 ? (
          <p className="navigator__empty">
            {lp.Filter ? 'フィルタに一致するアイテムがありません' : 'アイテムがありません'}
          </p>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map(vItem => {
              const item = sorted[vItem.index];
              const isSelected = lp.SelectedItemID === item.ID;
              return (
                <div
                  key={vItem.key}
                  className={[
                    'nav-item',
                    isSelected ? 'nav-item--selected' : '',
                    item.IsMetaOnly ? 'nav-item--meta-only' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    position: 'absolute',
                    top: vItem.start,
                    left: 0,
                    right: 0,
                    height: ITEM_HEIGHT,
                  }}
                  onClick={() => handleClick(item)}
                  title={item.Name}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleClick(item)}
                >
                  <ContentIcon type={item.ContentType} />
                  <span className="nav-item__title">{item.Name}</span>
                  <span className="nav-item__date">{formatDate(item.UpdateDate)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
