/**
 * ThinktankSearchView.tsx
 * 全文検索でThinkを選定する表示モード
 */

import { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { TTVault } from '../../models/TTVault';
import { TTThink } from '../../models/TTThink';
import { StorageManager } from '../../services/storage/StorageManager';
import { ThoughtsList } from './ThoughtsList';
import './ThinktankSearchView.css';

interface Props {
  vault: TTVault;
  selectedId: string;
  checkedIds: string[];
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
}

export function ThinktankSearchView({
  vault, selectedId, checkedIds, onSelect, onToggleCheck,
}: Props) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<TTThink[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const metas = await StorageManager.instance.search(vault.ID, q);
      const thinks = metas.map(meta => {
        const existing = vault.GetThink(meta.id);
        if (existing) return existing;
        const t = new TTThink();
        t.ID          = meta.id;
        t.VaultID     = meta.vaultId || vault.ID;
        t.ContentType = meta.contentType as TTThink['ContentType'];
        t.Keywords    = meta.keywords ?? '';
        t.RelatedIDs  = meta.relatedIds ?? '';
        t.IsMetaOnly  = true;
        t.setContentSilent(meta.title);
        return t;
      });
      setResults(thinks);
    } catch (e) {
      console.error('[ThinktankSearchView] search failed:', e);
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [query, vault]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  return (
    <div className="tt-search-view">
      <div className="tt-search-view__bar">
        <input
          className="tt-search-view__input"
          type="text"
          placeholder="内容を全文検索…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="tt-search-view__btn"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          aria-label="検索"
        >
          <Search size={14} />
        </button>
      </div>

      {loading && (
        <p className="tt-search-view__status">検索中…</p>
      )}
      {!loading && searched && results.length === 0 && (
        <p className="tt-search-view__status">該当するThinkが見つかりません</p>
      )}
      {!loading && results.length > 0 && (
        <ThoughtsList
          thoughts={results}
          selectedId={selectedId}
          checkedIds={checkedIds}
          onSelect={onSelect}
          onToggleCheck={onToggleCheck}
        />
      )}
    </div>
  );
}
