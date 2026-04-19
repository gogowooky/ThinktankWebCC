/**
 * DataGridView.tsx
 * 全アイテムをテーブル形式で表示するビュー。
 *
 * Phase 9:
 * - 列: チェックボックス / ContentType / タイトル / 更新日時 / 同期状態
 * - 同期状態: IsMetaOnly=gray / IsDirty=orange / 正常=非表示
 * - チェックした複数アイテム → 💬 ボタンでAIチャット起動（Phase 30 でフル実装）
 * - @tanstack/react-virtual で仮想スクロール
 * Phase 13 以降: IsMetaOnly アイテムのオンデマンドロード
 * Phase 30 以降: 💬 ボタンで RightChatView へ選択アイテムを渡す
 */

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  FileText, MessageCircle, Paperclip, Image,
  Mail, HardDrive, Link, File, MessageSquare,
} from 'lucide-react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import type { TTDataItem } from '../../../models/TTDataItem';
import type { ContentType } from '../../../types';
import './DataGridView.css';

// ── ContentType アイコン ─────────────────────────────────────────────

const CONTENT_ICONS: Record<ContentType, React.ReactNode> = {
  memo:  <FileText      size={13} />,
  chat:  <MessageCircle size={13} />,
  file:  <Paperclip    size={13} />,
  photo: <Image        size={13} />,
  email: <Mail         size={13} />,
  drive: <HardDrive    size={13} />,
  url:   <Link         size={13} />,
};

// ── 同期状態バッジ ───────────────────────────────────────────────────

function SyncBadge({ item }: { item: TTDataItem }) {
  if (item.IsMetaOnly) {
    return <span className="dg-sync dg-sync--meta">未取得</span>;
  }
  if (item.IsDirty) {
    return <span className="dg-sync dg-sync--dirty">未送信</span>;
  }
  return null;
}

// ── UpdateDate 短縮表示 ──────────────────────────────────────────────

function formatDate(updateDate: string): string {
  // "2026-04-19-153639-634-kv4l" → "04/19 15:36"
  const parts = updateDate.split('-');
  if (parts.length < 4) return '';
  const mmdd = `${parts[1]}/${parts[2]}`;
  const time = parts[3];
  const hhmm = time.length >= 4 ? `${time.slice(0, 2)}:${time.slice(2, 4)}` : '';
  return `${mmdd} ${hhmm}`;
}

// ── DataGridView 本体 ────────────────────────────────────────────────

const ROW_HEIGHT = 34;

export function DataGridView() {
  const app = TTApplication.Instance;
  useAppUpdate(app.Models.Memos);

  const allItems = app.Models.Memos.GetDataItems();

  // UpdateDate 降順ソート
  const sorted = useMemo(
    () => [...allItems].sort((a, b) => b.UpdateDate.localeCompare(a.UpdateDate)),
    [allItems]
  );

  // チェックボックス選択状態
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOne = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === sorted.length
        ? new Set()
        : new Set(sorted.map(i => i.ID))
    );
  }, [sorted]);

  // 仮想スクロール
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // 行クリック → texteditor で開く
  const handleRowClick = useCallback((item: TTDataItem) => {
    app.OpenItem(item.ID, 'texteditor');
  }, [app]);

  // 💬 チャット起動（Phase 30 でフル実装）
  const handleChatClick = useCallback(() => {
    const ids = [...selected];
    console.log('[DataGrid] チャット起動（未実装）対象:', ids);
    // Phase 30: app.OpenChatWithItems(ids)
  }, [selected]);

  const allChecked  = sorted.length > 0 && selected.size === sorted.length;
  const someChecked = selected.size > 0 && selected.size < sorted.length;

  return (
    <div className="datagrid">
      {/* ── ツールバー ─────────────────────────────── */}
      <div className="datagrid__toolbar">
        <span className="datagrid__count">
          {selected.size > 0
            ? `${selected.size} / ${sorted.length} 件選択`
            : `${sorted.length} 件`}
        </span>
        <button
          className={`datagrid__chat-btn${selected.size === 0 ? ' datagrid__chat-btn--disabled' : ''}`}
          onClick={handleChatClick}
          disabled={selected.size === 0}
          title={selected.size === 0 ? 'アイテムを選択してからクリック' : `${selected.size} 件でチャット（Phase 30 で実装）`}
        >
          <MessageSquare size={14} />
          <span>チャット</span>
        </button>
      </div>

      {/* ── テーブルヘッダー ───────────────────────── */}
      <div className="datagrid__header">
        <div className="dg-col dg-col--check">
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked; }}
            onChange={toggleAll}
            aria-label="全選択"
          />
        </div>
        <div className="dg-col dg-col--type">種別</div>
        <div className="dg-col dg-col--title">タイトル</div>
        <div className="dg-col dg-col--date">更新日時</div>
        <div className="dg-col dg-col--sync">状態</div>
      </div>

      {/* ── 仮想スクロールリスト ───────────────────── */}
      <div className="datagrid__body" ref={parentRef}>
        {sorted.length === 0 ? (
          <p className="datagrid__empty">アイテムがありません</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vItem => {
              const item = sorted[vItem.index];
              const isSelected = selected.has(item.ID);
              return (
                <div
                  key={vItem.key}
                  className={[
                    'dg-row',
                    isSelected ? 'dg-row--selected' : '',
                    item.IsMetaOnly ? 'dg-row--meta-only' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    position: 'absolute',
                    top: vItem.start,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                  }}
                >
                  {/* チェックボックス */}
                  <div
                    className="dg-col dg-col--check"
                    onClick={e => { e.stopPropagation(); toggleOne(item.ID); }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(item.ID)}
                      onClick={e => e.stopPropagation()}
                      aria-label={item.Name}
                    />
                  </div>

                  {/* ContentType アイコン */}
                  <div className="dg-col dg-col--type">
                    <span className="dg-type-icon">
                      {CONTENT_ICONS[item.ContentType] ?? <File size={13} />}
                    </span>
                  </div>

                  {/* タイトル（クリックで開く） */}
                  <div
                    className="dg-col dg-col--title"
                    onClick={() => handleRowClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && handleRowClick(item)}
                    title={item.Name}
                  >
                    <span className="dg-title">{item.Name}</span>
                  </div>

                  {/* 更新日時 */}
                  <div className="dg-col dg-col--date">
                    <span className="dg-date">{formatDate(item.UpdateDate)}</span>
                  </div>

                  {/* 同期状態 */}
                  <div className="dg-col dg-col--sync">
                    <SyncBadge item={item} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
