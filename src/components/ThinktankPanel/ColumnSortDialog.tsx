/**
 * ColumnSortDialog.tsx
 * TTThink 一覧の表示カラムとソートを設定するダイアログ
 * 行をドラッグ&ドロップして表示順を変更できる
 */

import { useRef, useState } from 'react';
import { X, GripVertical } from 'lucide-react';
import './ColumnSortDialog.css';

export type SortDir = 'asc' | 'desc';

export interface ColumnConfig {
  field: string;
  label: string;
  visible: boolean;
}

export interface SortConfig {
  field: string | null;
  dir: SortDir | null;
}

export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { field: 'Name',        label: 'タイトル',   visible: true  },
  { field: 'ID',          label: '作成日',     visible: true  },
  { field: 'UpdatedAt',   label: '更新日',     visible: true  },
  { field: 'ContentType', label: '種別',       visible: false },
  { field: 'Keywords',    label: 'キーワード', visible: false },
  { field: 'RelatedIDs',  label: '関連ID',     visible: false },
];

export const DEFAULT_SORT: SortConfig = { field: null, dir: null };

interface Props {
  columns: ColumnConfig[];
  sort: SortConfig;
  onColumnsChange: (cols: ColumnConfig[]) => void;
  onSortChange: (s: SortConfig) => void;
  onClose: () => void;
}

export function ColumnSortDialog({ columns, sort, onColumnsChange, onSortChange, onClose }: Props) {
  const dragIndexRef   = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const toggleVisible = (field: string) => {
    onColumnsChange(columns.map(c => c.field === field ? { ...c, visible: !c.visible } : c));
  };

  const handleSort = (field: string, dir: SortDir) => {
    if (sort.field === field && sort.dir === dir) {
      onSortChange({ field: null, dir: null });
    } else {
      onSortChange({ field, dir });
    }
  };

  // ── ドラッグ&ドロップ並び替え ────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== index) setDragOver(index);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) { cleanup(); return; }
    const next = [...columns];
    const [item] = next.splice(from, 1);
    next.splice(index, 0, item);
    onColumnsChange(next);
    cleanup();
  };

  const cleanup = () => {
    dragIndexRef.current = null;
    setDragOver(null);
  };

  return (
    <div className="col-sort-dialog__backdrop" onClick={onClose}>
      <div className="col-sort-dialog" onClick={e => e.stopPropagation()}>
        <div className="col-sort-dialog__header">
          <span className="col-sort-dialog__title">表示・ソート設定</span>
          <button className="col-sort-dialog__close" onClick={onClose}>
            <X size={12} />
          </button>
        </div>
        <table className="col-sort-dialog__table">
          <thead>
            <tr>
              <th className="col-sort-dialog__th col-sort-dialog__th--grip" />
              <th className="col-sort-dialog__th col-sort-dialog__th--field">フィールド</th>
              <th className="col-sort-dialog__th">表示</th>
              <th className="col-sort-dialog__th">↑</th>
              <th className="col-sort-dialog__th">↓</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col, i) => (
              <tr
                key={col.field}
                className={[
                  'col-sort-dialog__row',
                  dragOver === i ? 'col-sort-dialog__row--drag-over' : '',
                ].join(' ')}
                draggable
                onDragStart={e => handleDragStart(e, i)}
                onDragOver={e => handleDragOver(e, i)}
                onDrop={e => handleDrop(e, i)}
                onDragEnd={cleanup}
              >
                <td className="col-sort-dialog__td col-sort-dialog__td--grip">
                  <GripVertical size={12} className="col-sort-dialog__grip-icon" />
                </td>
                <td className="col-sort-dialog__td col-sort-dialog__td--field">{col.label}</td>
                <td className="col-sort-dialog__td col-sort-dialog__td--check">
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => toggleVisible(col.field)}
                  />
                </td>
                <td className="col-sort-dialog__td col-sort-dialog__td--check">
                  <input
                    type="checkbox"
                    checked={sort.field === col.field && sort.dir === 'asc'}
                    onChange={() => handleSort(col.field, 'asc')}
                  />
                </td>
                <td className="col-sort-dialog__td col-sort-dialog__td--check">
                  <input
                    type="checkbox"
                    checked={sort.field === col.field && sort.dir === 'desc'}
                    onChange={() => handleSort(col.field, 'desc')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
