import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
  const [searchQuery, setSearchQueryValue] = useState('');
  const [searchResults, setSearchResults] = useState<TTThink[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const requestGeneration = useRef(0);
  const currentVault = useRef(vault);

  useLayoutEffect(() => {
    currentVault.current = vault;
    requestGeneration.current += 1;
    setSearchResults([]);
    setSearchLoading(false);
    setSearchSearched(false);
    return () => { requestGeneration.current += 1; };
  }, [vault]);

  const setSearchQuery = useCallback<Dispatch<SetStateAction<string>>>((value) => {
    // 入力を変更した時点で失効させ、次の描画前に届く古い応答も反映させない。
    requestGeneration.current += 1;
    setSearchQueryValue(value);
    setSearchLoading(false);
    // Enterで確定するまでは、パネルが持つ元の一覧を表示する。
    setSearchSearched(false);
  }, []);
  const handleSearchQueryChange = setSearchQuery;

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || currentVault.current !== vault) return;
    const generation = ++requestGeneration.current;
    const isCurrent = () => generation === requestGeneration.current && currentVault.current === vault;
    addContentSearchKeywordToHighlighter(query);
    setSearchLoading(true);
    try {
      const metas = await StorageManager.instance.search(query);
      if (!isCurrent()) return;
      setSearchResults(metas.map(meta => searchThink(vault, meta)));
    } catch (error) {
      if (!isCurrent()) return;
      console.error(`[${source}] search failed:`, error);
      setSearchResults([]);
    } finally {
      if (isCurrent()) {
        setSearchLoading(false);
        setSearchSearched(true);
      }
    }
  }, [searchQuery, vault, source]);

  return {
    searchQuery, searchResults, searchLoading, searchSearched,
    setSearchQuery, setSearchResults, setSearchSearched,
    handleSearchQueryChange, handleSearch,
  };
}
