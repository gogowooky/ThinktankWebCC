/**
 * ThoughtsList.tsx
 * Phase 6: Thoughts 一覧（仮想スクロール）。
 *
 * 行形式: [チェック] [アイコン] タイトル [更新日]  行高さ 36px
 * チェックで複数 Thought 選択可能。
 * クリックで TTApplication.OpenThought(id) を呼ぶ。
 *
 * フィルター構文:
 *   スペース区切りでトークンに分割し AND 検索。
 *   "-word" で NOT、"OR" キーワードは OR 接続（将来対応）。
 */

import { useRef, useState, useEffect, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Library, FileText, MessageSquare, Link, Table2, Globe, Activity, File } from 'lucide-react';
import type { TTThink } from '../../models/TTThink';
import { DEFAULT_COLUMNS } from './ColumnSortDialog';
import type { ColumnConfig } from './ColumnSortDialog';
import { useHighlight } from '../../contexts/HighlightContext';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import './ThoughtsList.css';

const ROW_HEIGHT = 36;
const OVERSCAN   = 5;

interface Props {
  thoughts: TTThink[];
  selectedId: string;
  checkedIds: string[];
  columns?: ColumnConfig[];
  onOpen: (id: string) => void;
  onToggleCheck: (id: string | string[], force?: boolean) => void;
  focusedId: string | null;
  onFocusChange: (id: string | null) => void;
}

/** フィルタートークンを適用して TTThink[] を絞り込む */
export function applyFilter(thoughts: TTThink[], filter: string): TTThink[] {
  const raw = filter.trim();
  if (!raw) return thoughts;

  // カンマ ',' で分割しキーワードグループとする。グループ間の検索は OR 検索。
  const groups = raw.split(',').map(g => g.trim()).filter(Boolean);
  if (groups.length === 0) return thoughts;

  return thoughts.filter(t => {
    const text = `${t.Name} ${t.Keywords}`.toLowerCase();

    // グループ間の検索は OR 検索 (いずれかのグループがマッチすれば真)
    return groups.some(group => {
      // グループ内をスペース ' ' で分割し、トークンとする
      const tokens = group.split(/\s+/).map(tk => tk.trim()).filter(Boolean);
      if (tokens.length === 0) return false;

      // グループ内の検索は AND 検索 (すべてのトークンが条件を満たす必要がある)
      return tokens.every(token => {
        // 語頭に '-' がついたkeywordはnot検索
        if (token.startsWith('-') && token.length > 1) {
          const notWord = token.slice(1).toLowerCase();
          return !text.includes(notWord);
        }
        return text.includes(token.toLowerCase());
      });
    });
  });
}


function getTypeIcon(contentType: string) {
  switch (contentType.toLowerCase()) {
    case 'thought':  return <Library       size={13} className="thoughts-list__icon" />;
    case 'memo':     return <FileText    size={13} className="thoughts-list__icon" />;
    case 'chat':     return <MessageSquare size={13} className="thoughts-list__icon" />;
    case 'links':    return <Link        size={13} className="thoughts-list__icon" />;
    case 'table':    return <Table2      size={13} className="thoughts-list__icon" />;
    case 'nettext':  return <Globe       size={13} className="thoughts-list__icon" />;
    case 'status':   return <Activity    size={13} className="thoughts-list__icon" />;
    default:         return <File        size={13} className="thoughts-list__icon" />;
  }
}

function renderCell(col: ColumnConfig, thought: TTThink): ReactNode {
  switch (col.field) {
    case 'Name':
      return <span key="Name" className="thoughts-list__title" data-tip={thought.Name} data-tip-side="left">{thought.Name || '（無題）'}</span>;
    case 'ID':
      return <span key="ID" className="thoughts-list__date" data-tip="作成日(ID)" data-tip-side="left">{thought.ID.slice(0, 10)}</span>;
    case 'UpdatedAt':
      return <span key="UpdatedAt" className="thoughts-list__date thoughts-list__date--updated" data-tip="更新日" data-tip-side="left">{thought.UpdatedAt ? thought.UpdatedAt.slice(0, 10) : ''}</span>;
    case 'ContentType':
      return <span key="ContentType" className="thoughts-list__cell thoughts-list__cell--sm" data-tip="種別" data-tip-side="left">{thought.ContentType}</span>;
    case 'Keywords':
      return <span key="Keywords" className="thoughts-list__cell thoughts-list__cell--md" data-tip={thought.Keywords} data-tip-side="left">{thought.Keywords}</span>;
    case 'RelatedIDs':
      return <span key="RelatedIDs" className="thoughts-list__cell thoughts-list__cell--md" data-tip={thought.RelatedIDs} data-tip-side="left">{thought.RelatedIDs}</span>;
    default:
      return null;
  }
}

export function ThoughtsList({
  thoughts,
  selectedId,
  checkedIds,
  columns = DEFAULT_COLUMNS,
  onOpen,
  onToggleCheck,
  focusedId,
  onFocusChange,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { overviewThoughtIds, overviewIncludedIds, overviewCheckedIds, workoutIds, workoutFocusedId } = useHighlight();
  const isSimpleMode = TTUIStateManager.instance.getProperty('Application.PanelDisplay.Mode') === 'Simple';
  const visibleCols = columns.filter(c => c.visible);

  const virtualizer = useVirtualizer({
    count: thoughts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  // 外部からの focusedId の変更を検知して、スクロール位置を自動調整する
  useEffect(() => {
    if (focusedId) {
      const idx = thoughts.findIndex(t => t.ID === focusedId);
      if (idx !== -1) {
        virtualizer.scrollToIndex(idx, { align: 'auto' });
      }
    }
  }, [focusedId, thoughts, virtualizer]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const cur = focusedId ? thoughts.findIndex(t => t.ID === focusedId) : -1;
      const next = cur < 0
        ? (dir > 0 ? 0 : thoughts.length - 1)
        : Math.max(0, Math.min(thoughts.length - 1, cur + dir));
      onFocusChange(thoughts[next]?.ID ?? null);
      virtualizer.scrollToIndex(next, { align: 'auto' });
    } else if (e.key === 'Enter') {
      if (focusedId) onOpen(focusedId);
    }
  };

  const handleCheckClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const isCurrentlyChecked = checkedIds.includes(id);
    const nextChecked = !isCurrentlyChecked;

    if (e.shiftKey && focusedId && focusedId !== id) {
      const fromIdx = thoughts.findIndex(t => t.ID === focusedId);
      const toIdx = thoughts.findIndex(t => t.ID === id);
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx);
        const end = Math.max(fromIdx, toIdx);
        const idsInRange = thoughts.slice(start, end + 1).map(t => t.ID);
        onToggleCheck(idsInRange, nextChecked);
        onFocusChange(id);
        return;
      }
    }
    onToggleCheck(id);
    onFocusChange(id);
  };

  if (thoughts.length === 0) {
    return (
      <div className="thoughts-list thoughts-list--empty">
        <span>Thought がありません</span>
      </div>
    );
  }

  return (
    <div
      className="thoughts-list"
      ref={parentRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* 仮想スクロールの高さ確保用コンテナ */}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const thought = thoughts[vItem.index];
          const isSelected        = thought.ID === selectedId;
          const isChecked         = checkedIds.includes(thought.ID);
          const isOverviewThought  = !isSimpleMode && overviewThoughtIds.includes(thought.ID);
          const isOverviewIncluded = !isSimpleMode && overviewIncludedIds.includes(thought.ID);
          const isOverviewChecked  = !isSimpleMode && overviewCheckedIds.includes(thought.ID);
          const isInWorkout        = workoutIds.includes(thought.ID);
          const isWorkoutFocused   = workoutFocusedId === thought.ID;
          const isFocused          = thought.ID === focusedId;

          return (
            <div
              key={thought.ID}
              draggable
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('application/x-thought-id', thought.ID);
              }}
              className={[
                'thoughts-list__row',
                isSelected         ? 'thoughts-list__row--selected'         : '',
                isChecked          ? 'thoughts-list__row--checked'          : '',
                isOverviewThought  ? 'thoughts-list__row--overview-thought' : '',
                isOverviewIncluded ? 'thoughts-list__row--overview-included' : '',
                isOverviewChecked  ? 'thoughts-list__row--overview-checked' : '',
                isInWorkout        ? 'thoughts-list__row--workout'          : '',
                isWorkoutFocused   ? 'thoughts-list__row--workout-focused'  : '',
                isFocused          ? 'thoughts-list__row--focused'          : '',
              ].join(' ')}
              style={{
                position: 'absolute',
                top:    vItem.start,
                left:   0,
                right:  0,
                height: ROW_HEIGHT,
              }}
              onClick={() => onFocusChange(thought.ID)}
              onDoubleClick={() => onOpen(thought.ID)}
            >
              <input
                type="checkbox"
                className="thoughts-list__check"
                checked={isChecked}
                onChange={() => { /* onChangeはonClickで処理するため空 */ }}
                onClick={e => handleCheckClick(e, thought.ID)}
                aria-label={`${thought.Name} を選択`}
              />
              {getTypeIcon(thought.ContentType)}
              {visibleCols.map(col => renderCell(col, thought))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
