/**
 * ThinktankFilterView.tsx
 * タイトル・作成日(ID)・更新日でThinkを絞り込む表示モード
 * タイトル入力はプルダウン履歴付き
 */

import { useState, useMemo, useEffect } from 'react';
import { Type, CalendarDays, CalendarClock } from 'lucide-react';
import { ThoughtsList } from './ThoughtsList';
import type { TTThink } from '../../models/TTThink';
import './ThinktankFilterView.css';

const LS_HISTORY_KEY = 'tt-filter-title-history';
const DATALIST_ID    = 'tt-filter-title-list';
const MAX_HISTORY    = 10;

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) ?? '[]'); }
  catch { return []; }
}

function saveHistory(value: string): string[] {
  const prev = loadHistory().filter(h => h !== value);
  const next = [value, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(next));
  return next;
}

interface Props {
  thinks: TTThink[];
  selectedId: string;
  checkedIds: string[];
  checkedOnly?: boolean;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onVisibleChange?: (items: TTThink[]) => void;
}

export function ThinktankFilterView({
  thinks, selectedId, checkedIds, checkedOnly = false,
  onSelect, onToggleCheck, onVisibleChange,
}: Props) {
  const [titleQuery,  setTitleQuery]  = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo,   setCreatedTo]   = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo,   setUpdatedTo]   = useState('');
  const [history,     setHistory]     = useState(loadHistory);

  const filtered = useMemo<TTThink[]>(() => {
    let items = thinks;
    if (titleQuery.trim()) {
      const q = titleQuery.trim().toLowerCase();
      items = items.filter(t => t.Name.toLowerCase().includes(q));
    }
    if (createdFrom) items = items.filter(t => t.ID.slice(0, 10) >= createdFrom);
    if (createdTo)   items = items.filter(t => t.ID.slice(0, 10) <= createdTo);
    if (updatedFrom) items = items.filter(t => (t.UpdatedAt || t.ID).slice(0, 10) >= updatedFrom);
    if (updatedTo)   items = items.filter(t => (t.UpdatedAt || t.ID).slice(0, 10) <= updatedTo);
    if (checkedOnly) items = items.filter(t => checkedIds.includes(t.ID));
    return items;
  }, [thinks, titleQuery, createdFrom, createdTo, updatedFrom, updatedTo, checkedOnly, checkedIds]);

  useEffect(() => {
    onVisibleChange?.(filtered);
  }, [filtered, onVisibleChange]);

  const handleTitleBlur = () => {
    const v = titleQuery.trim();
    if (v) setHistory(saveHistory(v));
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const v = titleQuery.trim();
      if (v) setHistory(saveHistory(v));
    }
  };

  return (
    <div className="tt-filter-view">

      {/* タイトル絞り込みバー */}
      <div className="tt-filter-view__bar">
        <Type size={12} className="tt-filter-view__bar-icon" />
        <datalist id={DATALIST_ID}>
          {history.map(h => <option key={h} value={h} />)}
        </datalist>
        <input
          className="tt-filter-view__bar-input"
          type="text"
          list={DATALIST_ID}
          placeholder="タイトルで絞り込み…"
          value={titleQuery}
          onChange={e => setTitleQuery(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
        />
        <span className="tt-filter-view__bar-count">
          {filtered.length}/{thinks.length}
        </span>
      </div>

      {/* 作成日(ID) バー */}
      <div className="tt-filter-view__bar">
        <CalendarDays size={12} className="tt-filter-view__bar-icon" />
        <input
          className="tt-filter-view__bar-date"
          type="date" title="作成日 開始"
          value={createdFrom} onChange={e => setCreatedFrom(e.target.value)}
        />
        <span className="tt-filter-view__bar-sep">〜</span>
        <input
          className="tt-filter-view__bar-date"
          type="date" title="作成日 終了"
          value={createdTo} onChange={e => setCreatedTo(e.target.value)}
        />
      </div>

      {/* 更新日バー */}
      <div className="tt-filter-view__bar">
        <CalendarClock size={12} className="tt-filter-view__bar-icon" />
        <input
          className="tt-filter-view__bar-date"
          type="date" title="更新日 開始"
          value={updatedFrom} onChange={e => setUpdatedFrom(e.target.value)}
        />
        <span className="tt-filter-view__bar-sep">〜</span>
        <input
          className="tt-filter-view__bar-date"
          type="date" title="更新日 終了"
          value={updatedTo} onChange={e => setUpdatedTo(e.target.value)}
        />
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
