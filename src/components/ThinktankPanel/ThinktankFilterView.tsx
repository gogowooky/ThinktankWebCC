/**
 * ThinktankFilterView.tsx
 * タイトル・作成日(ID)・更新日でThinkを絞り込む表示モード（表示専用）
 */

import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { flattenThinkTree } from '../../utils/thinkTree';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import type { TTThink } from '../../models/TTThink';
import type { ColumnConfig } from './ColumnSortDialog';
import { computeDateRange } from '../../utils/dateUtils';
import './ThinktankFilterView.css';
import { toLocalDate } from '../../utils/localDateTime';

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
  bundleNames?: Map<string, string>;
  onOpen: (id: string) => void;
  onToggleCheck: (id: string | string[], force?: boolean) => void;
  /** 一覧の行（Tree 表示では展開後の行。同じ Think が複数回入ることがある） */
  onVisibleChange?: (items: TTThink[]) => void;
  focusedId: string | null;
  focusedRow?: number;
  onFocusChange: (id: string | null, row?: number) => void;
  /** 指定すると Tree 表示にし、各行の下にこの関数が返す Think を字下げして並べる */
  childrenOf?: (id: string) => TTThink[];
}

export function ThinktankFilterView({
  thinks, selectedId, checkedIds, checkedOnly = false,
  titleQuery, createdDate, createdRange, updatedDate, updatedRange,
  columns, bundleNames, onOpen, onToggleCheck, onVisibleChange, focusedId, focusedRow, onFocusChange,
  childrenOf,
}: Props) {

  const filtered = useMemo<TTThink[]>(() => {
    let items = applyFilter(thinks, titleQuery);

    const cR = computeDateRange(createdDate, createdRange);
    if (cR) items = items.filter(t => { const d = t.ID.slice(0, 10); return d >= cR.from && d <= cR.to; });

    const uR = computeDateRange(updatedDate, updatedRange);
    if (uR) items = items.filter(t => { const d = toLocalDate(t.UpdatedAt || t.ID); return d >= uR.from && d <= uR.to; });

    if (checkedOnly) items = items.filter(t => checkedIds.includes(t.ID));
    return items;
  }, [thinks, titleQuery, createdDate, createdRange, updatedDate, updatedRange, checkedOnly, checkedIds]);

  // 既定はすべて開いた状態にし、閉じた行だけを覚える
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const handleToggleExpand = useCallback((key: string, expand: boolean) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (expand) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // 子は絞り込み条件にかけず、親が含んでいるものをすべて出す
  const tree = useMemo(
    () => (childrenOf ? flattenThinkTree(filtered, childrenOf, collapsed) : null),
    [filtered, childrenOf, collapsed],
  );
  const rows = tree?.thinks ?? filtered;

  const rowsKey = useMemo(() => (tree ? tree.rows.map(r => r.key) : rows.map(t => t.ID)).join('\0'), [tree, rows]);
  const onVisibleRef = useRef(onVisibleChange);
  onVisibleRef.current = onVisibleChange;

  useEffect(() => {
    onVisibleRef.current?.(rows);
  }, [rowsKey]);

  return (
    <div className="tt-filter-view">
      <ThoughtsList
        thoughts={rows}
        treeRows={tree?.rows}
        onToggleExpand={handleToggleExpand}
        focusedRow={focusedRow}
        selectedId={selectedId}
        checkedIds={checkedIds}
        columns={columns}
        bundleNames={bundleNames}
        onOpen={onOpen}
        onToggleCheck={onToggleCheck}
        focusedId={focusedId}
        onFocusChange={onFocusChange}
      />
    </div>
  );
}
