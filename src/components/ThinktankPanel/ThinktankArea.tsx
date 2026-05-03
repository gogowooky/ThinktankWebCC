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
import { UnifiedFilterPanel } from './UnifiedFilterPanel';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchView } from './ThinktankSearchView';
import { computeDateRange, parseRange } from '../../utils/dateUtils';
import { AiChatView } from './AiChatView';
import type { ChatMessage } from '../../types';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from './ColumnSortDialog';
import type { ColumnConfig, SortConfig } from './ColumnSortDialog';
import './ThinktankArea.css';

import type { LayoutMode } from '../Layout/AppLayout';

const THINKTANK_MODE_NAMES: Record<string, string> = {
  filter:   'Think一覧',
  search:   '検索',
  thoughts: 'Thought一覧',
  ai:       'AI相談',
  settings: '設定',
};

interface Props {
  app: TTApplication;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
}

export function ThinktankArea({ app, layoutMode, onLayoutModeChange }: Props) {
  const panel = app.ThinktankPanel;
  const vault = app.Models.Vault;

  useAppUpdate(panel);
  useAppUpdate(vault);

  // filter モードの可視アイテムとタイトルクエリはコールバックで受け取る
  const [filterVisible,    setFilterVisible]    = useState<TTThink[]>([]);
  const [filterTitleQuery, setFilterTitleQuery] = useState('');

  const handleFilterVisibleChange = useCallback((items: TTThink[]) => {
    setFilterVisible(prev => {
      if (prev.length === items.length && prev.every((t, i) => t === items[i])) return prev;
      return items;
    });
  }, []);

  // 日付フィルターバーの表示状態
  const [showDateFilter, setShowDateFilter] = useState(false);

  // 表示カラム・ソート設定
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,    setSort]    = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  // 日付フィルター state（全モード共通）
  const [createdDate,  setCreatedDate]  = useState('');
  const [createdRange, setCreatedRange] = useState('');
  const [updatedDate,  setUpdatedDate]  = useState('');
  const [updatedRange, setUpdatedRange] = useState('');

  // チャット state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWaiting,  setChatWaiting]  = useState(false);

  // 検索 state（ビュー切り替えで消えないよう ThinktankArea で保持）
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<TTThink[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const [searchHistory,  setSearchHistory]  = useState<string[]>([]);

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
    const thoughtId = app.OverviewPanel.ThoughtID;
    if (thoughtId) {
      const thinks = vault.GetThinksForThought(thoughtId);
      if (!thinks.some(t => t.ID === id)) return;
    }
    app.OpenThinkInWorkout(id);
  }, [app, vault]);

  // Thought一覧モードのクリック: OverviewPanelには影響させずThinktankPanel内選択のみ
  const handleSelectThought = useCallback((id: string) => {
    panel.SelectThought(id);
  }, [panel]);

  const handleToggleCheck = useCallback((id: string | string[], force?: boolean) => {
    panel.ToggleCheck(id, force);
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
    app.RemoveThinksFromWorkout(panel.CheckedThoughtIDs);
    await vault.DeleteThinks(panel.CheckedThoughtIDs);
    panel.ClearChecks();
  }, [app, panel, vault]);

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

  const canCreateThought =
    panel.ViewMode === 'search'
      ? searchQuery.trim() !== ''
      : panel.ViewMode === 'filter'
      ? true
      : panel.ViewMode === 'thoughts'
      ? true
      : panel.CheckedThoughtIDs.length > 0;

  const handleCreateThought = useCallback(async () => {
    const dates = { createdDate, createdRange, updatedDate, updatedRange };
    let think;
    if (panel.ViewMode === 'search' && searchQuery.trim() !== '') {
      think = await vault.CreateThoughtFromSearch(searchQuery.trim(), panel.CheckedThoughtIDs, dates);
    } else if (panel.ViewMode === 'filter') {
      think = await vault.CreateThoughtFromFilter(filterTitleQuery.trim(), panel.CheckedThoughtIDs, dates);
    } else if (panel.ViewMode === 'thoughts' && panel.CheckedThoughtIDs.length > 1) {
      think = await vault.CreateThoughtFromThoughts(panel.CheckedThoughtIDs);
    } else {
      if (panel.CheckedThoughtIDs.length === 0) return;
      think = await vault.CreateThoughtFromIds(panel.CheckedThoughtIDs, filterTitleQuery.trim(), dates);
    }
    panel.ClearChecks();
    // panel.SelectThought(think.ID); // Overviewモードへの自動登録を停止
  }, [panel, vault, searchQuery, filterTitleQuery, createdDate, createdRange, updatedDate, updatedRange]);

  // チャット送信・保存
  const handleChatSend = useCallback((text: string) => {
    const ts = new Date().toISOString();
    setChatMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: ts }]);
    setChatWaiting(true);
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        id:        `a-${Date.now()}`,
        role:      'assistant',
        content:   'Phase 14 でバックエンド接続後に応答します。\nSSE ストリーミングで逐次出力される予定です。',
        timestamp: new Date().toISOString(),
      }]);
      setChatWaiting(false);
    }, 800);
  }, []);

  const handleSaveChat = useCallback(async () => {
    if (chatMessages.length === 0) return;
    const firstUser = chatMessages.find(m => m.role === 'user')?.content ?? '';
    const title = firstUser.slice(0, 50) || `Chat ${new Date().toLocaleDateString('ja-JP')}`;
    const body = chatMessages.map(m => m.role === 'user' ? `## ${m.content}` : m.content).join('\n');
    await vault.CreateChatThink(`${title}\n${body}`);
    setChatMessages([]);
  }, [chatMessages, vault]);

  // 検索実行（state は ThinktankArea で保持）
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchHistory(prev => prev.includes(q) ? prev : [q, ...prev].slice(0, 20));
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
        onOpen={handleSelect}
        onToggleCheck={handleToggleCheck}
        onVisibleChange={handleFilterVisibleChange}
        titleQuery={filterTitleQuery}
      />
    );
  } else if (panel.ViewMode === 'search') {
    content = (
      <ThinktankSearchView
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        checkedOnly={panel.ShowCheckedOnly}
        results={searchResults}
        visibleResults={searchVisible}
        totalVaultCount={vault.Count}
        loading={searchLoading}
        searched={searchSearched}
        columns={columns}
        onOpen={handleSelect}
        onToggleCheck={handleToggleCheck}
      />
    );
  } else if (panel.ViewMode === 'ai') {
    content = <AiChatView messages={chatMessages} isWaiting={chatWaiting} onSend={handleChatSend} onSave={handleSaveChat} />;
  } else if (panel.ViewMode === 'settings') {
    content = <ThinktankSettingsView layoutMode={layoutMode} onLayoutModeChange={onLayoutModeChange} />;
  } else {
    // デフォルト: thoughts モード
    content = (
      <ThoughtsList
        thoughts={thoughtsVisible}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        columns={columns}
        onOpen={id => app.OpenThought(id, 'datagrid')}
        onToggleCheck={handleToggleCheck}
      />
    );
  }

  const showDateBars = showDateFilter && ['thoughts', 'filter', 'search'].includes(panel.ViewMode);
  const createdRangeInvalid = createdRange.trim() !== '' && !parseRange(createdRange.trim());
  const updatedRangeInvalid = updatedRange.trim() !== '' && !parseRange(updatedRange.trim());

  return (
    <div className="thinktank-area">
      <div className="panel-title-row thinktank-area__title-row">
        Thinktank&gt;{THINKTANK_MODE_NAMES[panel.ViewMode] ?? panel.ViewMode}
      </div>
      <ThinktankMenuRibbon
        visibleIds={visibleThinks.map(t => t.ID)}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={panel.ShowCheckedOnly}
        allVaultChecked={vault.GetThinks().length > 0 && vault.GetThinks().every(t => panel.CheckedThoughtIDs.includes(t.ID))}
        showDateFilter={showDateFilter}
        showColumnDialog={showColumnDialog}
        canCreateThought={canCreateThought}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onToggleAllVault={handleToggleAllVault}
        onToggleDateFilter={handleToggleDateFilter}
        onToggleColumnDialog={handleToggleColumnDialog}
        onCreateThought={handleCreateThought}
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

      <UnifiedFilterPanel
        historyKey={panel.ViewMode === 'search' ? 'tt-search' : 'tt-filter'}
        textValue={
          panel.ViewMode === 'search' ? searchQuery :
          panel.ViewMode === 'filter' ? filterTitleQuery :
          panel.Filter
        }
        onTextChange={
          panel.ViewMode === 'search' ? setSearchQuery :
          panel.ViewMode === 'filter' ? setFilterTitleQuery :
          handleFilterChange
        }
        createdDate={createdDate}
        onCreatedDateChange={setCreatedDate}
        createdRange={createdRange}
        onCreatedRangeChange={setCreatedRange}
        updatedDate={updatedDate}
        onUpdatedDateChange={setUpdatedDate}
        updatedRange={updatedRange}
        onUpdatedRangeChange={setUpdatedRange}
        visibleCount={
          panel.ViewMode === 'search' ? searchVisible.length :
          panel.ViewMode === 'filter' ? thoughtsVisible.length :
          thoughtsVisible.length
        }
        totalCount={
          panel.ViewMode === 'search' ? searchResults.length :
          panel.ViewMode === 'filter' ? allThoughts.length :
          allThoughts.length
        }
        showDateFilters={showDateFilter && ['thoughts', 'filter', 'search'].includes(panel.ViewMode)}
      />

      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
