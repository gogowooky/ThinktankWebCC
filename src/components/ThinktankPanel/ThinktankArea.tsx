/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TTThink } from '../../models/TTThink';
import { StorageManager } from '../../services/storage/StorageManager';
import { ThinktankMenuRibbon } from './ThinktankMenuRibbon';
import { ThoughtsFilter } from './ThoughtsFilter';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchView } from './ThinktankSearchView';
import { ThinktankAiView } from './ThinktankAiView';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import './ThinktankArea.css';

interface Props {
  app: TTApplication;
}

export function ThinktankArea({ app }: Props) {
  const panel = app.ThinktankPanel;
  const vault = app.Models.Vault;

  useAppUpdate(panel);
  useAppUpdate(vault);

  // filter モードの可視アイテムはコールバックで受け取る
  const [filterVisible, setFilterVisible] = useState<TTThink[]>([]);

  // 検索 state（ビュー切り替えで消えないよう ThinktankArea で保持）
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<TTThink[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);

  // thoughts モードの可視アイテムはレンダー時に直接計算
  const allThoughts    = vault.GetThoughts();
  const thoughtsBase   = applyFilter(allThoughts, panel.Filter);
  const thoughtsVisible = panel.ShowCheckedOnly
    ? thoughtsBase.filter(t => panel.CheckedThoughtIDs.includes(t.ID))
    : thoughtsBase;

  // 検索結果に ShowCheckedOnly を適用
  const searchVisible = panel.ShowCheckedOnly
    ? searchResults.filter(t => panel.CheckedThoughtIDs.includes(t.ID))
    : searchResults;

  const visibleThinks =
    panel.ViewMode === 'thoughts' ? thoughtsVisible :
    panel.ViewMode === 'filter'   ? filterVisible   :
    panel.ViewMode === 'search'   ? searchVisible   : [];

  // ── ハンドラ ─────────────────────────────────────────────────────────

  const handleSelect = useCallback((id: string) => {
    app.OpenThought(id);
  }, [app]);

  const handleToggleCheck = useCallback((id: string) => {
    panel.ToggleCheck(id);
  }, [panel]);

  const handleFilterChange = useCallback((value: string) => {
    panel.SetFilter(value);
  }, [panel]);

  const handleCheckAll = useCallback(() => {
    panel.CheckAll(visibleThinks.map(t => t.ID));
  }, [panel, visibleThinks]);

  const handleClearChecks = useCallback(() => {
    panel.ClearChecks();
  }, [panel]);

  const handleDeleteChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    if (!window.confirm(`${panel.CheckedThoughtIDs.length} 件を削除しますか？`)) return;
    await vault.DeleteThinks(panel.CheckedThoughtIDs);
    panel.ClearChecks();
  }, [panel, vault]);

  const handleToggleCheckedOnly = useCallback(() => {
    panel.ToggleShowCheckedOnly();
  }, [panel]);

  const handleCreateThought = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    const think = await vault.CreateThoughtFromIds(panel.CheckedThoughtIDs, panel.Filter);
    panel.ClearChecks();
    app.OpenThought(think.ID);
  }, [panel, vault, app]);

  // 検索実行（state は ThinktankArea で保持）
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const metas = await StorageManager.instance.search(q);
      const thinks = metas.map(meta => {
        const existing = vault.GetThink(meta.id);
        if (existing) return existing;
        const t = new TTThink();
        t.ID          = meta.id;
        t.VaultID     = vault.ID;
        t.ContentType = meta.contentType as TTThink['ContentType'];
        t.Keywords    = meta.keywords  ?? '';
        t.RelatedIDs  = meta.relatedIds ?? '';
        t.IsMetaOnly  = true;
        t.setContentSilent(meta.title);
        return t;
      });
      setSearchResults(thinks);
    } catch (e) {
      console.error('[ThinktankArea] search failed:', e);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
      setSearchSearched(true);
    }
  }, [searchQuery, vault]);

  // ── モード別コンテンツ ───────────────────────────────────────────────

  let content: React.ReactNode;

  if (panel.ViewMode === 'filter') {
    content = (
      <ThinktankFilterView
        thinks={vault.GetThinks()}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        checkedOnly={panel.ShowCheckedOnly}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
        onVisibleChange={setFilterVisible}
      />
    );
  } else if (panel.ViewMode === 'search') {
    content = (
      <ThinktankSearchView
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        checkedOnly={panel.ShowCheckedOnly}
        query={searchQuery}
        results={searchResults}
        visibleResults={searchVisible}
        loading={searchLoading}
        searched={searchSearched}
        onQueryChange={setSearchQuery}
        onSearch={handleSearch}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
      />
    );
  } else if (panel.ViewMode === 'ai') {
    content = <ThinktankAiView />;
  } else if (panel.ViewMode === 'settings') {
    content = <ThinktankSettingsView />;
  } else {
    // デフォルト: thoughts モード
    content = (
      <>
        <ThoughtsFilter
          value={panel.Filter}
          onChange={handleFilterChange}
          visibleCount={thoughtsVisible.length}
          totalCount={allThoughts.length}
        />
        <ThoughtsList
          thoughts={thoughtsVisible}
          selectedId={panel.SelectedThoughtID}
          checkedIds={panel.CheckedThoughtIDs}
          onSelect={handleSelect}
          onToggleCheck={handleToggleCheck}
        />
      </>
    );
  }

  return (
    <div className="thinktank-area">
      <ThinktankMenuRibbon
        visibleIds={visibleThinks.map(t => t.ID)}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={panel.ShowCheckedOnly}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onCreateThought={handleCreateThought}
      />
      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
