/**
 * ThinktankFilterView.tsx
 * タイトル・日時でThinkを絞り込む表示モード
 */

import { useState, useMemo } from 'react';
import { ThoughtsList } from './ThoughtsList';
import type { TTThink } from '../../models/TTThink';
import './ThinktankFilterView.css';

interface Props {
  thinks: TTThink[];
  selectedId: string;
  checkedIds: string[];
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
}

export function ThinktankFilterView({
  thinks, selectedId, checkedIds, onSelect, onToggleCheck,
}: Props) {
  const [titleQuery, setTitleQuery] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  const filtered = useMemo<TTThink[]>(() => {
    let items = thinks;

    if (titleQuery.trim()) {
      const q = titleQuery.trim().toLowerCase();
      items = items.filter(t => t.Name.toLowerCase().includes(q));
    }
    if (dateFrom) {
      items = items.filter(t => {
        const d = t.UpdatedAt ? t.UpdatedAt.slice(0, 10) : t.ID.slice(0, 10);
        return d >= dateFrom;
      });
    }
    if (dateTo) {
      items = items.filter(t => {
        const d = t.UpdatedAt ? t.UpdatedAt.slice(0, 10) : t.ID.slice(0, 10);
        return d <= dateTo;
      });
    }
    return items;
  }, [thinks, titleQuery, dateFrom, dateTo]);

  return (
    <div className="tt-filter-view">
      <div className="tt-filter-view__inputs">
        <input
          className="tt-filter-view__input"
          type="text"
          placeholder="タイトルで絞り込み…"
          value={titleQuery}
          onChange={e => setTitleQuery(e.target.value)}
        />
        <div className="tt-filter-view__date-row">
          <input
            className="tt-filter-view__input tt-filter-view__input--date"
            type="date"
            title="開始日"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span className="tt-filter-view__date-sep">〜</span>
          <input
            className="tt-filter-view__input tt-filter-view__input--date"
            type="date"
            title="終了日"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>
      </div>
      <ThoughtsList
        thoughts={filtered}
        selectedId={selectedId}
        checkedIds={checkedIds}
        onSelect={onSelect}
        onToggleCheck={onToggleCheck}
      />
    </div>
  );
}
