import { useCallback, useState } from 'react';
import { TTThink } from '../models/TTThink';
import type { TTVault } from '../models/TTVault';
import { StorageManager } from '../services/storage/StorageManager';
import type { ThinkMeta } from '../services/storage/IStorageBackend';
import { addContentSearchKeywordToHighlighter } from '../utils/highlighterKeyword';

function searchThink(vault: TTVault, meta: ThinkMeta): TTThink {
  const existing = vault.GetThink(meta.thinkid);
  if (existing) return existing;
  const think = new TTThink();
  think.ID = meta.thinkid;
  think.VaultID = vault.ID;
  think.ContentType = meta.category as TTThink['ContentType'];
  think.Keywords = meta.keywords ?? '';
  think.RelatedIDs = meta.relatedIds ?? '';
  think.IsMetaOnly = true;
  think.setContentSilent(meta.title);
  return think;
}

export function useContentSearch(vault: TTVault, source: 'ThinktankArea' | 'SeedsArea') {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TTThink[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    // Enterで確定するまでは、パネルが持つ元の一覧を表示する。
    setSearchSearched(false);
  }, []);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;
    addContentSearchKeywordToHighlighter(query);
    setSearchLoading(true);
    try {
      const metas = await StorageManager.instance.search(query);
      setSearchResults(metas.map(meta => searchThink(vault, meta)));
    } catch (error) {
      console.error(`[${source}] search failed:`, error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
      setSearchSearched(true);
    }
  }, [searchQuery, vault, source]);

  return {
    searchQuery, searchResults, searchLoading, searchSearched,
    setSearchQuery, setSearchResults, setSearchSearched,
    handleSearchQueryChange, handleSearch,
  };
}
