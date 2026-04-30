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

import { useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Brain, FileText, MessageSquare, Link, Table2, Globe, Activity, File } from 'lucide-react';
import type { TTThink } from '../../models/TTThink';
import { DEFAULT_COLUMNS } from './ColumnSortDialog';
import type { ColumnConfig } from './ColumnSortDialog';
import { useHighlight } from '../../contexts/HighlightContext';
import './ThoughtsList.css';

const ROW_HEIGHT = 36;
const OVERSCAN   = 5;

interface Props {
  thoughts: TTThink[];
  selectedId: string;
  checkedIds: string[];
  columns?: ColumnConfig[];
  onOpen: (id: string) => void;
  onToggleCheck: (id: string) => void;
}

/** フィルタートークンを適用して TTThink[] を絞り込む */
export function applyFilter(thoughts: TTThink[], filter: string): TTThink[] {
  const raw = filter.trim();
  if (!raw) return thoughts;

  // スペース区切りで AND トークンに分割（"-" prefix で NOT）
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);

  return thoughts.filter(t => {
    const text = `${t.Name} ${t.Keywords}`.toLowerCase();
    return tokens.every(token => {
      if (token.startsWith('-') && token.length > 1) {
        return !text.includes(token.slice(1));
      }
      return text.includes(token);
    });
  });
}


function getTypeIcon(contentType: string) {
  switch (contentType.toLowerCase()) {
    case 'thought':  return <Brain       size={13} className="thoughts-list__icon" />;
    case 'memo':     return <FileText    size={13} className="thoughts-list__icon" />;
    case 'chat':     return <MessageSquare size={13} className="thoughts-list__icon" />;
    case 'links':    return <Link        size={13} className="thoughts-list__icon" />;
    case 'tables':   return <Table2      size={13} className="thoughts-list__icon" />;
    case 'nettext':  return <Globe       size={13} className="thoughts-list__icon" />;
    case 'status':   return <Activity    size={13} className="thoughts-list__icon" />;
    default:         return <File        size={13} className="thoughts-list__icon" />;
  }
}

function renderCell(col: ColumnConfig, thought: TTThink): ReactNode {
  switch (col.field) {
    case 'Name':
      return <span key="Name" className="thoughts-list__title" title={thought.Name}>{thought.Name || '（無題）'}</span>;
    case 'ID':
      return <span key="ID" className="thoughts-list__date" title="作成日(ID)">{thought.ID.slice(0, 10)}</span>;
    case 'UpdatedAt':
      return <span key="UpdatedAt" className="thoughts-list__date thoughts-list__date--updated" title="更新日">{thought.UpdatedAt ? thought.UpdatedAt.slice(0, 10) : ''}</span>;
    case 'ContentType':
      return <span key="ContentType" className="thoughts-list__cell thoughts-list__cell--sm" title="種別">{thought.ContentType}</span>;
    case 'Keywords':
      return <span key="Keywords" className="thoughts-list__cell thoughts-list__cell--md" title={thought.Keywords}>{thought.Keywords}</span>;
    case 'RelatedIDs':
      return <span key="RelatedIDs" className="thoughts-list__cell thoughts-list__cell--md" title={thought.RelatedIDs}>{thought.RelatedIDs}</span>;
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
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { overviewThoughtIds, workoutIds } = useHighlight();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const visibleCols = columns.filter(c => c.visible);

  const virtualizer = useVirtualizer({
    count: thoughts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const cur = focusedId ? thoughts.findIndex(t => t.ID === focusedId) : -1;
      const next = cur < 0
        ? (dir > 0 ? 0 : thoughts.length - 1)
        : Math.max(0, Math.min(thoughts.length - 1, cur + dir));
      setFocusedId(thoughts[next]?.ID ?? null);
      virtualizer.scrollToIndex(next, { align: 'auto' });
    } else if (e.key === 'Enter') {
      if (focusedId) onOpen(focusedId);
    }
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
          const isOverviewThought = overviewThoughtIds.includes(thought.ID);
          const isInWorkout       = workoutIds.includes(thought.ID);
          const isFocused         = thought.ID === focusedId;

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
                isSelected        ? 'thoughts-list__row--selected'        : '',
                isChecked         ? 'thoughts-list__row--checked'          : '',
                isOverviewThought ? 'thoughts-list__row--overview-thought' : '',
                isInWorkout       ? 'thoughts-list__row--workout'          : '',
                isFocused         ? 'thoughts-list__row--focused'          : '',
              ].join(' ')}
              style={{
                position: 'absolute',
                top:    vItem.start,
                left:   0,
                right:  0,
                height: ROW_HEIGHT,
              }}
              onClick={() => setFocusedId(thought.ID)}
              onDoubleClick={() => onOpen(thought.ID)}
            >
              <input
                type="checkbox"
                className="thoughts-list__check"
                checked={isChecked}
                onChange={e => { e.stopPropagation(); onToggleCheck(thought.ID); }}
                onClick={e => e.stopPropagation()}
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
