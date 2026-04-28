/**
 * ThinktankFilterView.tsx
 * タイトル・作成日(ID)・更新日でThinkを絞り込む表示モード
 * タイトル入力はプルダウン履歴付き
 * 日付フィルターは「日付 + 範囲指定」方式: +Nd, -1m, +-2w など
 * 日付 state は ThinktankArea で管理（全モード共通）
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Type } from 'lucide-react';
import { ThoughtsList } from './ThoughtsList';
import type { TTThink } from '../../models/TTThink';
import type { ColumnConfig } from './ColumnSortDialog';
import './ThinktankFilterView.css';

const LS_HISTORY_KEY = 'tt-filter-title-history';
const DATALIST_ID    = 'tt-filter-title-list';
const MAX_HISTORY    = 10;

// ── 履歴 ─────────────────────────────────────────────────────────────────────

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

// ── 日付範囲ユーティリティ（ThinktankArea でも import して使用） ─────────────

type RangeSign = '+' | '-' | '+-';
type RangeUnit = 'y' | 'm' | 'w' | 'd';

interface ParsedRange { sign: RangeSign; value: number; unit: RangeUnit; }

export function parseRange(s: string): ParsedRange | null {
  const m = s.match(/^(\+\-|\+|\-)(\d+)([ymwd])$/);
  if (!m) return null;
  return { sign: m[1] as RangeSign, value: parseInt(m[2], 10), unit: m[3] as RangeUnit };
}

function shiftDate(base: Date, delta: number, unit: RangeUnit): Date {
  const d = new Date(base);
  if (unit === 'y') d.setFullYear(d.getFullYear() + delta);
  else if (unit === 'm') d.setMonth(d.getMonth() + delta);
  else if (unit === 'w') d.setDate(d.getDate() + delta * 7);
  else d.setDate(d.getDate() + delta);
  return d;
}

function toStr(d: Date): string { return d.toISOString().slice(0, 10); }

export function computeDateRange(dateStr: string, rangeStr: string): { from: string; to: string } | null {
  if (!dateStr) return null;
  const base = new Date(dateStr + 'T00:00:00');
  const trimmed = rangeStr.trim();
  if (!trimmed) return { from: dateStr, to: dateStr };
  const r = parseRange(trimmed);
  if (!r) return { from: dateStr, to: dateStr };
  if (r.sign === '+')  return { from: dateStr, to: toStr(shiftDate(base,  r.value, r.unit)) };
  if (r.sign === '-')  return { from: toStr(shiftDate(base, -r.value, r.unit)), to: dateStr };
  return {
    from: toStr(shiftDate(base, -r.value, r.unit)),
    to:   toStr(shiftDate(base,  r.value, r.unit)),
  };
}

// ── コンポーネント ───────────────────────────────────────────────────────────

interface Props {
  thinks: TTThink[];
  selectedId: string;
  checkedIds: string[];
  checkedOnly?: boolean;
  // 日付フィルター state（ThinktankArea で管理・全モード共通）
  createdDate:  string;
  createdRange: string;
  updatedDate:  string;
  updatedRange: string;
  columns?: ColumnConfig[];
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onVisibleChange?: (items: TTThink[]) => void;
}

export function ThinktankFilterView({
  thinks, selectedId, checkedIds, checkedOnly = false,
  createdDate, createdRange, updatedDate, updatedRange,
  columns,
  onSelect, onToggleCheck, onVisibleChange,
}: Props) {
  // タイトル検索はこのビュー固有のローカル state
  const [titleQuery, setTitleQuery] = useState('');
  const [history,    setHistory]    = useState(loadHistory);

  const filtered = useMemo<TTThink[]>(() => {
    let items = thinks;
    if (titleQuery.trim()) {
      const q = titleQuery.trim().toLowerCase();
      items = items.filter(t => t.Name.toLowerCase().includes(q));
    }
    const cR = computeDateRange(createdDate, createdRange);
    if (cR) items = items.filter(t => { const d = t.ID.slice(0, 10); return d >= cR.from && d <= cR.to; });
    const uR = computeDateRange(updatedDate, updatedRange);
    if (uR) items = items.filter(t => { const d = (t.UpdatedAt || t.ID).slice(0, 10); return d >= uR.from && d <= uR.to; });
    if (checkedOnly) items = items.filter(t => checkedIds.includes(t.ID));
    return items;
  }, [thinks, titleQuery, createdDate, createdRange, updatedDate, updatedRange, checkedOnly, checkedIds]);

  // ID列が変わった時のみ通知（配列参照変化による無限ループを防ぐ）
  const filteredKey = useMemo(() => filtered.map(t => t.ID).join('\0'), [filtered]);
  const onVisibleRef = useRef(onVisibleChange);
  onVisibleRef.current = onVisibleChange;

  useEffect(() => {
    onVisibleRef.current?.(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredKey]);

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

      <ThoughtsList
        thoughts={filtered}
        selectedId={selectedId}
        checkedIds={checkedIds}
        columns={columns}
        onSelect={onSelect}
        onToggleCheck={onToggleCheck}
      />
    </div>
  );
}
