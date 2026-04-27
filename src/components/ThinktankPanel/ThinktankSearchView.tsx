/**
 * ThinktankSearchView.tsx
 * 全文検索でThinkを選定する表示モード（controlled component）
 * 検索 state は ThinktankArea で保持し、ビュー切り替えで消えない。
 */

import { useCallback } from 'react';
import { Search } from 'lucide-react';
import { TTThink } from '../../models/TTThink';
import { ThoughtsList } from './ThoughtsList';
import './ThinktankSearchView.css';

interface Props {
  selectedId:    string;
  checkedIds:    string[];
  checkedOnly:   boolean;
  query:         string;
  results:       TTThink[];
  visibleResults: TTThink[];
  loading:       boolean;
  searched:      boolean;
  onQueryChange: (q: string) => void;
  onSearch:      () => void;
  onSelect:      (id: string) => void;
  onToggleCheck: (id: string) => void;
}

export function ThinktankSearchView({
  selectedId, checkedIds, query, results, visibleResults,
  loading, searched, onQueryChange, onSearch, onSelect, onToggleCheck,
}: Props) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSearch();
  }, [onSearch]);

  return (
    <div className="tt-search-view">
      <div className="tt-search-view__bar">
        <input
          className="tt-search-view__input"
          type="text"
          placeholder="内容を全文検索…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="tt-search-view__btn"
          onClick={onSearch}
          disabled={loading || !query.trim()}
          aria-label="検索"
        >
          <Search size={14} />
        </button>
        {searched && !loading && (
          <span className="tt-search-view__count">
            {visibleResults.length}/{results.length}
          </span>
        )}
      </div>

      {loading && (
        <p className="tt-search-view__status">検索中…</p>
      )}
      {!loading && searched && results.length === 0 && (
        <p className="tt-search-view__status">該当するThinkが見つかりません</p>
      )}
      {!loading && visibleResults.length > 0 && (
        <ThoughtsList
          thoughts={visibleResults}
          selectedId={selectedId}
          checkedIds={checkedIds}
          onSelect={onSelect}
          onToggleCheck={onToggleCheck}
        />
      )}
    </div>
  );
}
