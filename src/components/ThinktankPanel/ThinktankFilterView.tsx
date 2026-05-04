/**
 * ThinktankFilterView.tsx
 * タイトル・作成日(ID)・更新日でThinkを絞り込む表示モード（表示専用）
 */

import { useMemo, useEffect, useRef } from 'react';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import type { TTThink } from '../../models/TTThink';
import type { ColumnConfig } from './ColumnSortDialog';
import { computeDateRange } from '../../utils/dateUtils';
import './ThinktankFilterView.css';

interface Props {
  thinks: TTThink[];
  selectedId: string;
  checkedIds: string[];
  checkedOnly?: boolean;
  titleQuery: string;
  createdDate: string;
  createdRange: string;
  updatedDate: string;
  updatedRange: string;
  columns?: ColumnConfig[];
  onOpen: (id: string) => void;
  onToggleCheck: (id: string | string[], force?: boolean) => void;
  onVisibleChange?: (items: TTThink[]) => void;
}

export function ThinktankFilterView({
  thinks, selectedId, checkedIds, checkedOnly = false,
  titleQuery, createdDate, createdRange, updatedDate, updatedRange,
  columns, onOpen, onToggleCheck, onVisibleChange,
}: Props) {

  const filtered = useMemo<TTThink[]>(() => {
    let items = applyFilter(thinks, titleQuery);

    const cR = computeDateRange(createdDate, createdRange);
    if (cR) items = items.filter(t => { const d = t.ID.slice(0, 10); return d >= cR.from && d <= cR.to; });

    const uR = computeDateRange(updatedDate, updatedRange);
    if (uR) items = items.filter(t => { const d = (t.UpdatedAt || t.ID).slice(0, 10); return d >= uR.from && d <= uR.to; });

    if (checkedOnly) items = items.filter(t => checkedIds.includes(t.ID));
    return items;
  }, [thinks, titleQuery, createdDate, createdRange, updatedDate, updatedRange, checkedOnly, checkedIds]);

  const filteredKey = useMemo(() => filtered.map(t => t.ID).join('\0'), [filtered]);
  const onVisibleRef = useRef(onVisibleChange);
  onVisibleRef.current = onVisibleChange;

  useEffect(() => {
    onVisibleRef.current?.(filtered);
  }, [filteredKey]);

  return (
    <div className="tt-filter-view">
      <ThoughtsList
        thoughts={filtered}
        selectedId={selectedId}
        checkedIds={checkedIds}
        columns={columns}
        onOpen={onOpen}
        onToggleCheck={onToggleCheck}
      />
    </div>
  );
}
