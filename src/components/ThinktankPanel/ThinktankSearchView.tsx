/**
 * ThinktankSearchView.tsx
 * 全文検索・セマンティック検索でThinkを選定する表示モード（Phase 15）
 */

import { TTThink } from '../../models/TTThink';
import { ThoughtsList } from './ThoughtsList';
import type { ColumnConfig } from './ColumnSortDialog';
import './ThinktankSearchView.css';

export type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  fulltext: '全文',
  semantic: 'AI意味',
  hybrid:   'ハイブリッド',
};

interface Props {
  selectedId:         string;
  checkedIds:         string[];
  checkedOnly:        boolean;
  results:            TTThink[];
  visibleResults:     TTThink[];
  totalVaultCount:    number;
  loading:            boolean;
  searched:           boolean;
  columns?:           ColumnConfig[];
  searchMode:         SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onOpen:             (id: string) => void;
  onToggleCheck:      (id: string | string[], force?: boolean) => void;
}

export function ThinktankSearchView({
  selectedId, checkedIds, results, visibleResults, totalVaultCount,
  loading, searched, columns,
  searchMode, onSearchModeChange,
  onOpen, onToggleCheck,
}: Props) {
  void totalVaultCount;

  return (
    <div className="tt-search-view">
      {/* 検索モード切替 */}
      <div className="tt-search-view__mode-bar">
        {(Object.keys(SEARCH_MODE_LABELS) as SearchMode[]).map(mode => (
          <button
            key={mode}
            className={`tt-search-view__mode-btn${searchMode === mode ? ' tt-search-view__mode-btn--active' : ''}`}
            onClick={() => onSearchModeChange(mode)}
            title={mode === 'semantic' ? 'Vertex AI text-embedding-004 によるセマンティック検索' : mode === 'hybrid' ? 'AI意味 + 全文のハイブリッド検索' : '通常のキーワード全文検索'}
          >
            {SEARCH_MODE_LABELS[mode]}
          </button>
        ))}
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
          columns={columns}
          onOpen={onOpen}
          onToggleCheck={onToggleCheck}
        />
      )}
    </div>
  );
}
