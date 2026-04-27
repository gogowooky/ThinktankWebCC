/**
 * ThoughtsFilter.tsx
 * Phase 6: Thoughts 絞り込みテキストボックス。
 *
 * AND / OR / NOT 構文（スペース区切り）でフィルタリング。
 * 入力内容は TTThinktankPanel.Filter に即時反映する。
 */

import { Search, X } from 'lucide-react';
import './ThoughtsFilter.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  visibleCount?: number;
  totalCount?: number;
}

export function ThoughtsFilter({ value, onChange, visibleCount, totalCount }: Props) {
  return (
    <div className="thoughts-filter">
      <Search size={12} className="thoughts-filter__icon" />
      <input
        className="thoughts-filter__input"
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="フィルター…"
        spellCheck={false}
      />
      {value && (
        <button
          className="thoughts-filter__clear"
          onClick={() => onChange('')}
          aria-label="フィルタークリア"
        >
          <X size={11} />
        </button>
      )}
      {totalCount !== undefined && (
        <span className="thoughts-filter__count">
          {visibleCount ?? totalCount}/{totalCount}
        </span>
      )}
    </div>
  );
}
