/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 * 日付フィルターは全モード共通で適用される。
 */

import { useCallback, useState } from 'react';
import { CalendarDays, CalendarClock } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TTThink } from '../../models/TTThink';
import { StorageManager } from '../../services/storage/StorageManager';
import { ThinktankMenuRibbon } from './ThinktankMenuRibbon';
import { ThoughtsFilter } from './ThoughtsFilter';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import { ThinktankFilterView, computeDateRange, parseRange } from './ThinktankFilterView';
import { ThinktankSearchView } from './ThinktankSearchView';
import { ThinktankAiView } from './ThinktankAiView';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from './ColumnSortDialog';
import type { ColumnConfig, SortConfig } from './ColumnSortDialog';
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

  const handleFilterVisibleChange = useCallback((items: TTThink[]) => {
    setFilterVisible(prev => {
      if (prev.length === items.length && prev.every((t, i) => t === items[i])) return prev;
      return items;
    });
  }, []);

  // 日付フィルターバーの表示状態
  const [showDateFilter, setShowDateFilter] = useState(true);

  // 表示カラム・ソート設定
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,    setSort]    = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  // 日付フィルター state（全モード共通）
  const [createdDate,  setCreatedDate]  = useState('');
  const [createdRange, setCreatedRange] = useState('');
  const [updatedDate,  setUpdatedDate]  = useState('');
  const [updatedRange, setUpdatedRange] = useState('');

  // 検索 state（ビュー切り替えで消えないよう ThinktankArea で保持）
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<TTThink[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);

  // ── ソート適用 ────────────────────────────────────────────────────────────

  function getFieldValue(t: TTThink, field: string): string {
    switch (field) {
      case 'Name':        return t.Name.toLowerCase();
      case 'ID':          return t.ID;
      case 'UpdatedAt':   return t.UpdatedAt || t.ID;
      case 'ContentType': return t.ContentType;
      case 'Keywords':    return t.Keywords.toLowerCase();
      case 'RelatedIDs':  return t.RelatedIDs;
      default:            return '';
    }
  }

  function applySort(items: TTThink[]): TTThink[] {
    if (!sort.field || !sort.dir) return items;
    const { field, dir } = sort;
    return [...items].sort((a, b) => {
      const av = getFieldValue(a, field);
      const bv = getFieldValue(b, field);
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // ── 日付範囲フィルター適用 ────────────────────────────────────────────────

  function applyDateFilter(items: TTThink[]): TTThink[] {
    if (!showDateFilter) return items;
    const cR = computeDateRange(createdDate, createdRange);
    const uR = computeDateRange(updatedDate, updatedRange);
    if (!cR && !uR) return items;
    return items.filter(t => {
      if (cR) { const d = t.ID.slice(0, 10); if (d < cR.from || d > cR.to) return false; }
      if (uR) { const d = (t.UpdatedAt || t.ID).slice(0, 10); if (d < uR.from || d > uR.to) return false; }
      return true;
    });
  }

  // ── 各モードの可視アイテム計算 ────────────────────────────────────────────

  const allThoughts   = vault.GetThoughts();
  const thoughtsBase  = applyFilter(allThoughts, panel.Filter);
  const thoughtsVisible = applySort(applyDateFilter(
    panel.ShowCheckedOnly
      ? thoughtsBase.filter(t => panel.CheckedThoughtIDs.includes(t.ID))
      : thoughtsBase
  ));

  const searchVisible = applySort(applyDateFilter(
    panel.ShowCheckedOnly
      ? searchResults.filter(t => panel.CheckedThoughtIDs.includes(t.ID))
      : searchResults
  ));

  const visibleThinks =
    panel.ViewMode === 'thoughts' ? thoughtsVisible :
    panel.ViewMode === 'filter'   ? filterVisible   :
    panel.ViewMode === 'search'   ? searchVisible   : [];

  // ── ハンドラ ─────────────────────────────────────────────────────────────

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

  const handleToggleColumnDialog = useCallback(() => {
    setShowColumnDialog(v => !v);
  }, []);

  const handleToggleDateFilter = useCallback(() => {
    setShowDateFilter(v => {
      if (v) {
        setCreatedDate('');
        setCreatedRange('');
        setUpdatedDate('');
        setUpdatedRange('');
      }
      return !v;
    });
  }, []);

  const handleToggleAllVault = useCallback(() => {
    const allIds = vault.GetThinks().map(t => t.ID);
    const allChecked = allIds.length > 0 && allIds.every(id => panel.CheckedThoughtIDs.includes(id));
    if (allChecked) panel.ClearChecks();
    else panel.CheckAll(allIds);
  }, [panel, vault]);

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

  // ── モード別コンテンツ ───────────────────────────────────────────────────

  let content: React.ReactNode;

  if (panel.ViewMode === 'filter') {
    content = (
      <ThinktankFilterView
        thinks={applySort(vault.GetThinks())}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        checkedOnly={panel.ShowCheckedOnly}
        createdDate={createdDate}
        createdRange={createdRange}
        updatedDate={updatedDate}
        updatedRange={updatedRange}
        columns={columns}
        onSelect={handleSelect}
        onToggleCheck={handleToggleCheck}
        onVisibleChange={handleFilterVisibleChange}
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
        totalVaultCount={vault.Count}
        loading={searchLoading}
        searched={searchSearched}
        columns={columns}
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
          columns={columns}
          onSelect={handleSelect}
          onToggleCheck={handleToggleCheck}
        />
      </>
    );
  }

  const showDateBars = showDateFilter && ['thoughts', 'filter', 'search'].includes(panel.ViewMode);
  const createdRangeInvalid = createdRange.trim() !== '' && !parseRange(createdRange.trim());
  const updatedRangeInvalid = updatedRange.trim() !== '' && !parseRange(updatedRange.trim());

  return (
    <div className="thinktank-area">
      <ThinktankMenuRibbon
        visibleIds={visibleThinks.map(t => t.ID)}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={panel.ShowCheckedOnly}
        allVaultChecked={vault.GetThinks().length > 0 && vault.GetThinks().every(t => panel.CheckedThoughtIDs.includes(t.ID))}
        showDateFilter={showDateFilter}
        showColumnDialog={showColumnDialog}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onCreateThought={handleCreateThought}
        onToggleAllVault={handleToggleAllVault}
        onToggleDateFilter={handleToggleDateFilter}
        onToggleColumnDialog={handleToggleColumnDialog}
      />

      {showColumnDialog && (
        <ColumnSortDialog
          columns={columns}
          sort={sort}
          onColumnsChange={setColumns}
          onSortChange={setSort}
          onClose={() => setShowColumnDialog(false)}
        />
      )}

      {showDateBars && (
        <div className="thinktank-area__date-bars">
          <div className="tt-filter-view__bar">
            <CalendarDays size={12} className="tt-filter-view__bar-icon" />
            <input
              className="tt-filter-view__bar-date"
              type="date"
              title="作成日(ID)"
              value={createdDate}
              onChange={e => setCreatedDate(e.target.value)}
            />
            <input
              className={`tt-filter-view__bar-range${createdRangeInvalid ? ' tt-filter-view__bar-range--invalid' : ''}`}
              type="text"
              placeholder="+Nd"
              title="範囲: +3d(以降) / -1m(以前) / +-2w(前後)  指定なし=1日"
              value={createdRange}
              onChange={e => setCreatedRange(e.target.value)}
            />
          </div>
          <div className="tt-filter-view__bar">
            <CalendarClock size={12} className="tt-filter-view__bar-icon" />
            <input
              className="tt-filter-view__bar-date"
              type="date"
              title="更新日"
              value={updatedDate}
              onChange={e => setUpdatedDate(e.target.value)}
            />
            <input
              className={`tt-filter-view__bar-range${updatedRangeInvalid ? ' tt-filter-view__bar-range--invalid' : ''}`}
              type="text"
              placeholder="+Nd"
              title="範囲: +3d(以降) / -1m(以前) / +-2w(前後)  指定なし=1日"
              value={updatedRange}
              onChange={e => setUpdatedRange(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
