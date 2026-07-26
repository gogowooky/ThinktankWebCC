/**
 * FilterSelectDialog.tsx
 * Think一覧のフィルター欄（タイトル・作成日(ID)・更新日・コンテンツ・種別）の
 * 表示/非表示を切り替えるダイアログ。ColumnSortDialog と同じ見た目を流用する。
 */

import { X } from 'lucide-react';
import './ColumnSortDialog.css';

export interface FilterVisibility {
  title:       boolean;
  createdDate: boolean;
  updatedDate: boolean;
  content:     boolean;
  type:        boolean;
}

export const DEFAULT_FILTER_VISIBILITY: FilterVisibility = {
  title:       true,
  createdDate: true,
  updatedDate: true,
  content:     true,
  type:        true,
};

/** AI相談モードの DataGrid 用フィルター表示のデフォルト（タイトルのみ ON） */
export const DEFAULT_CHAT_FILTER_VISIBILITY: FilterVisibility = {
  title:       true,
  createdDate: false,
  updatedDate: false,
  content:     false,
  type:        false,
};

const FILTER_ITEMS: { field: keyof FilterVisibility; label: string }[] = [
  { field: 'title',       label: 'タイトル' },
  { field: 'createdDate', label: '作成日(ID)' },
  { field: 'updatedDate', label: '更新日' },
  { field: 'content',     label: 'コンテンツ' },
  { field: 'type',        label: '種別' },
];

interface Props {
  visibility:    FilterVisibility;
  onChange:      (v: FilterVisibility) => void;
  onClose:       () => void;
  /** ダイアログの選択肢から除外するフィールド（省略時は全項目を表示） */
  hiddenFields?: (keyof FilterVisibility)[];
}

export function FilterSelectDialog({ visibility, onChange, onClose, hiddenFields = [] }: Props) {
  const toggle = (field: keyof FilterVisibility) => {
    onChange({ ...visibility, [field]: !visibility[field] });
  };
  const items = FILTER_ITEMS.filter(item => !hiddenFields.includes(item.field));

  return (
    <div className="col-sort-dialog__backdrop" onClick={onClose}>
      <div className="col-sort-dialog" onClick={e => e.stopPropagation()}>
        <table className="col-sort-dialog__table">
          <thead>
            <tr>
              <th className="col-sort-dialog__th col-sort-dialog__th--grip">
                <button className="col-sort-dialog__close-in-table" onClick={onClose}>
                  <X size={10} />
                </button>
              </th>
              <th className="col-sort-dialog__th col-sort-dialog__th--field">フィルター項目</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.field} className="col-sort-dialog__row">
                <td className="col-sort-dialog__td col-sort-dialog__td--check">
                  <input
                    type="checkbox"
                    checked={visibility[item.field]}
                    onChange={() => toggle(item.field)}
                  />
                </td>
                <td className="col-sort-dialog__td col-sort-dialog__td--field">{item.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
