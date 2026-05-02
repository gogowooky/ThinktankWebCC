/**
 * ThinktankSearchView.tsx
 * 全文検索でThinkを選定する表示モード（表示専用）
 */

import { TTThink } from '../../models/TTThink';
import { ThoughtsList } from './ThoughtsList';
import type { ColumnConfig } from './ColumnSortDialog';
import './ThinktankSearchView.css';

interface Props {
  selectedId:      string;
  checkedIds:      string[];
  checkedOnly:     boolean;
  results:         TTThink[];
  visibleResults:  TTThink[];
  totalVaultCount: number;
  loading:         boolean;
  searched:        boolean;
  columns?:        ColumnConfig[];
  onOpen:          (id: string) => void;
  onToggleCheck:   (id: string | string[], force?: boolean) => void;
}

export function ThinktankSearchView({
  selectedId, checkedIds, results, visibleResults, totalVaultCount,
  loading, searched, columns, onOpen, onToggleCheck,
}: Props) {

  return (
    <div className="tt-search-view">
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
