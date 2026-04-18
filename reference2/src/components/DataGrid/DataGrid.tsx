import { useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { TTDataItem } from '../../models/TTDataItem';
import type { SortDirection } from '../../types';
import { highlightTextSpans } from '../../utils/highlightSpans';
import './DataGrid.css';

/**
 * DataGrid - react-window仮想スクロールテーブル
 *
 * ヘッダ行（ソート切替）+ 仮想スクロール行リスト。
 * 列定義はコレクションのColumnMapping/ColumnMaxWidthから取得。
 * チェックボックス列で複数選択対応。
 */

interface ColumnDef {
  property: string;
  label: string;
  maxWidth: number; // -1 = flex
}

interface DataGridProps {
  items: TTDataItem[];
  columns: ColumnDef[];
  selectedId: string;
  checkedIds: Set<string>;
  sortProperty: string;
  sortDir: SortDirection;
  width: number;
  height: number;
  highlightKeyword?: string;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onSort: (property: string) => void;
}

const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 18;
const CHECK_COL_WIDTH = 26;

/** 列幅を計算。maxWidth(ch)をpxに換算（1ch≒7px）。-1はflex */
function calcColumnWidths(columns: ColumnDef[], totalWidth: number): number[] {
  const availableWidth = totalWidth - CHECK_COL_WIDTH;
  const chToPx = 7;
  const fixedWidths: (number | null)[] = columns.map(col =>
    col.maxWidth > 0 ? col.maxWidth * chToPx : null
  );
  let fixedTotal = 0;
  let flexCount = 0;
  for (const w of fixedWidths) {
    if (w !== null) fixedTotal += w;
    else flexCount++;
  }
  const remainWidth = Math.max(0, availableWidth - fixedTotal);
  const flexWidth = flexCount > 0 ? remainWidth / flexCount : 0;

  return fixedWidths.map(w => w !== null ? w : flexWidth);
}

export function DataGrid({
  items, columns, selectedId, checkedIds, sortProperty, sortDir,
  width, height, highlightKeyword, onSelect, onToggleCheck, onSort,
}: DataGridProps) {
  const colWidths = useMemo(() => calcColumnWidths(columns, width), [columns, width]);
  const listHeight = Math.max(0, height - HEADER_HEIGHT);

  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = items[index];
    const isSelected = item.ID === selectedId;
    const isChecked = checkedIds.has(item.ID);
    return (
      <div
        className={`datagrid-row ${isSelected ? 'datagrid-row-selected' : ''}`}
        style={style}
        onClick={() => onSelect(item.ID)}
      >
        <div
          className="datagrid-cell datagrid-check-cell"
          style={{ width: CHECK_COL_WIDTH, minWidth: CHECK_COL_WIDTH }}
          onClick={(e) => { e.stopPropagation(); onToggleCheck(item.ID); }}
        >
          <span className="datagrid-check">
            {isChecked ? '☑' : '☐'}
          </span>
        </div>
        {columns.map((col, ci) => {
          const text = String((item as unknown as Record<string, unknown>)[col.property] ?? '');
          return (
            <div
              key={col.property}
              className="datagrid-cell"
              style={{ width: colWidths[ci], minWidth: colWidths[ci] }}
            >
              {highlightKeyword ? highlightTextSpans(text, highlightKeyword) : text}
            </div>
          );
        })}
      </div>
    );
  }, [items, columns, colWidths, selectedId, checkedIds, highlightKeyword, onSelect, onToggleCheck]);

  if (items.length === 0) {
    return (
      <div className="datagrid" style={{ width, height }}>
        <div className="datagrid-empty">No items</div>
      </div>
    );
  }

  return (
    <div className="datagrid" style={{ width, height }}>
      {/* ヘッダ */}
      <div className="datagrid-header">
        <div
          className={`datagrid-header-cell datagrid-check-header ${sortProperty === '_check' ? 'datagrid-header-cell-sorted' : ''}`}
          style={{ width: CHECK_COL_WIDTH, minWidth: CHECK_COL_WIDTH }}
          onClick={() => onSort('_check')}
        >
          <span className="datagrid-check datagrid-check-header-mark">☑</span>
          {sortProperty === '_check' && (
            <span className="datagrid-sort-indicator" style={{ color: '#fff' }}>
              {sortDir === 'asc' ? '▲' : '▼'}
            </span>
          )}
        </div>
        {columns.map((col, ci) => {
          const isSorted = sortProperty === col.property;
          return (
            <div
              key={col.property}
              className={`datagrid-header-cell ${isSorted ? 'datagrid-header-cell-sorted' : ''}`}
              style={{ width: colWidths[ci], minWidth: colWidths[ci] }}
              onClick={() => onSort(col.property)}
            >
              {col.label}
              {isSorted && (
                <span className="datagrid-sort-indicator">
                  {sortDir === 'asc' ? '▲' : '▼'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ボディ（仮想スクロール） */}
      <div className="datagrid-body">
        <List
          width={width}
          height={listHeight}
          itemCount={items.length}
          itemSize={ROW_HEIGHT}
        >
          {Row}
        </List>
      </div>
    </div>
  );
}
