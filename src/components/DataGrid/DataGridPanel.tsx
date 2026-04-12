import { useEffect, useState, useCallback, useMemo } from 'react';
import { TTColumn } from '../../views/TTColumn';
import { TTDataItem } from '../../models/TTDataItem';
import { DataGrid } from './DataGrid';
import type { SortDirection } from '../../types';

/**
 * DataGridPanel - DataGridパネルのコンテンツ領域
 *
 * TTColumnのDataGrid関連状態を購読し、コレクションからアイテムを取得・
 * フィルタ・ソートしてDataGridコンポーネントに渡す。
 */

interface DataGridPanelProps {
  column: TTColumn;
  width: number;
  height: number;
}

interface ColumnDef {
  property: string;
  label: string;
  maxWidth: number;
}

export function DataGridPanel({ column, width, height }: DataGridPanelProps) {
  const [tick, setTick] = useState(0);

  // コレクション変更を購読
  useEffect(() => {
    const rerender = () => setTick(t => t + 1);
    const colKey = `DataGridPanel-col-${column.Index}`;
    column.AddOnUpdate(colKey, rerender);

    const collection = column.GetCurrentCollection();
    const collKey = `DataGridPanel-coll-${column.Index}`;
    collection?.AddOnUpdate(collKey, rerender);

    return () => {
      column.RemoveOnUpdate(colKey);
      collection?.RemoveOnUpdate(collKey);
    };
  }, [column, column.DataGridResource]);

  // コレクションから列定義を取得
  const columns: ColumnDef[] = useMemo(() => {
    void tick; // tickの変更で再計算
    const collection = column.GetCurrentCollection();
    if (!collection) return [];

    const mapping = collection.GetColumnMappingRecord();
    const maxWidths = collection.GetColumnMaxWidthRecord();
    const props = (collection.ListPropertiesMin || 'ID,Name').split(',').map(s => s.trim());

    return props.map(prop => ({
      property: prop,
      label: mapping[prop] || prop,
      maxWidth: maxWidths[prop] ?? -1,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column.DataGridResource, tick]);

  // アイテムの取得・ソート
  const items: TTDataItem[] = useMemo(() => {
    void tick; // tickの変更で再計算
    const collection = column.GetCurrentCollection();
    if (!collection) return [];

    let result = collection.GetDataItems();

    // フィルタ: comma区切り=OR, space区切り=AND, -接頭辞=NOT
    const filter = column.DataGridFilter.trim();
    if (filter) {
      const orGroups = filter.split(',').map(g => g.trim()).filter(Boolean);
      result = result.filter(item => {
        const text = `${item.ID} ${item.Name} ${item.Keywords}`.toLowerCase();
        return orGroups.some(group => {
          const terms = group.split(/\s+/).filter(Boolean);
          return terms.every(term => {
            if (term.startsWith('-') && term.length > 1) {
              return !text.includes(term.slice(1).toLowerCase());
            }
            return text.includes(term.toLowerCase());
          });
        });
      });
    }

    // ソート
    const sortProp = column.DataGridSortProperty;
    const sortDir = column.DataGridSortDir;
    result = [...result].sort((a, b) => {
      const va = String((a as unknown as Record<string, unknown>)[sortProp] ?? '');
      const vb = String((b as unknown as Record<string, unknown>)[sortProp] ?? '');
      const cmp = va.localeCompare(vb);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column, column.DataGridFilter, column.DataGridSortProperty, column.DataGridSortDir, column.DataGridResource, tick]);

  // 選択ハンドラ
  const handleSelect = useCallback((id: string) => {
    column.SelectedItemID = id;
  }, [column]);

  // チェックハンドラ
  const handleToggleCheck = useCallback((id: string) => {
    column.toggleChecked(id);
  }, [column]);

  const handleToggleAllCheck = useCallback((ids: string[], checked: boolean) => {
    column.setAllChecked(ids, checked);
  }, [column]);

  // ソート切替ハンドラ
  const handleSort = useCallback((property: string) => {
    if (column.DataGridSortProperty === property) {
      column.DataGridSortDir = column.DataGridSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      column.DataGridSortProperty = property;
      column.DataGridSortDir = 'desc';
    }
    column.NotifyUpdated(false);
  }, [column]);

  const targets = column.HighlightTargets;
  const hlKeyword = targets.dataGrid && column.HighlighterKeyword ? column.HighlighterKeyword : undefined;

  return (
    <DataGrid
      items={items}
      columns={columns}
      selectedId={column.SelectedItemID}
      checkedIds={column.CheckedItemIDs}
      sortProperty={column.DataGridSortProperty}
      sortDir={column.DataGridSortDir as SortDirection}
      width={width}
      height={height}
      highlightKeyword={hlKeyword}
      onSelect={handleSelect}
      onToggleCheck={handleToggleCheck}
      onToggleAllCheck={handleToggleAllCheck}
      onSort={handleSort}
    />
  );
}
