/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 * 日付フィルターは全モード共通で適用される。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TTThink } from '../../models/TTThink';
import { StorageManager } from '../../services/storage/StorageManager';
import { ThinktankMenuRibbon } from './ThinktankMenuRibbon';
import { UnifiedFilterPanel } from './UnifiedFilterPanel';
import { ThoughtsList, applyFilter } from './ThoughtsList';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchView } from './ThinktankSearchView';
import { applySort, applyDateFilter } from '../../utils/sortUtils';
import type { DateFilterState } from '../../utils/sortUtils';
import { AiChatView } from './AiChatView';
import type { AiChatViewRef } from './AiChatView';
import type { ChatMessage } from '../../types';
import { streamChat } from '../../services/ChatApiService';
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
  const chatAbortRef                    = useRef<AbortController | null>(null);
  const chatAccumulatedRef              = useRef('');
  const aiChatViewRef                   = useRef<AiChatViewRef>(null);

  const handleScrollPrev = useCallback(() => aiChatViewRef.current?.scrollToPrevUser(), []);
  const handleScrollNext = useCallback(() => aiChatViewRef.current?.scrollToNextUser(), []);

  // 検索 state（ビュー切り替えで消えないよう ThinktankArea で保持）
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<TTThink[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const [searchHistory,  setSearchHistory]  = useState<string[]>([]);

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  const dateFilter = useMemo<DateFilterState>(() => ({
    show: showDateFilter,
    createdDate, createdRange, updatedDate, updatedRange,
  }), [showDateFilter, createdDate, createdRange, updatedDate, updatedRange]);

  // vault.Count が変わったとき（追加・削除）のみ再取得
  const allThoughts = useMemo(() => vault.GetThoughts(), [vault.Count]); // eslint-disable-line react-hooks/exhaustive-deps
  const allThinks   = useMemo(() => vault.GetThinks(),   [vault.Count]); // eslint-disable-line react-hooks/exhaustive-deps

  const thoughtsBase = useMemo(
    () => applyFilter(allThoughts, panel.Filter),
    [allThoughts, panel.Filter],
  );

  const checkedSet = useMemo(
    () => new Set(panel.CheckedThoughtIDs),
    [panel.CheckedThoughtIDs],
  );

  const thoughtsVisible = useMemo(() => {
    const base = panel.ShowCheckedOnly
      ? thoughtsBase.filter(t => checkedSet.has(t.ID))
      : thoughtsBase;
    return applySort(applyDateFilter(base, dateFilter), sort);
  }, [thoughtsBase, panel.ShowCheckedOnly, checkedSet, dateFilter, sort]);

  const searchVisible = useMemo(() => {
    const base = panel.ShowCheckedOnly
      ? searchResults.filter(t => checkedSet.has(t.ID))
      : searchResults;
    return applySort(applyDateFilter(base, dateFilter), sort);
  }, [searchResults, panel.ShowCheckedOnly, checkedSet, dateFilter, sort]);

  // filter モードで ThinktankFilterView に渡すソート済み全件
  const sortedAllThinks = useMemo(() => applySort(allThinks, sort), [allThinks, sort]);

  const visibleThinks =
    panel.ViewMode === 'thoughts' ? thoughtsVisible :
    panel.ViewMode === 'filter'   ? filterVisible   :
    panel.ViewMode === 'search'   ? searchVisible   : [];

  const visibleIds = useMemo(() => visibleThinks.map(t => t.ID), [visibleThinks]);

  const allVaultChecked = useMemo(
    () => allThinks.length > 0 && allThinks.every(t => checkedSet.has(t.ID)),
    [allThinks, checkedSet],
  );

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
    panel.CheckAll(visibleIds);
  }, [panel, visibleIds]);

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
    const allIds = allThinks.map(t => t.ID);
    const allChecked = allIds.length > 0 && allIds.every(id => checkedSet.has(id));
    if (allChecked) panel.ClearChecks();
    else panel.CheckAll(allIds);
  }, [panel, allThinks, checkedSet]);

  const handleOpenThought = useCallback((id: string) => {
    app.OpenThought(id, 'datagrid');
  }, [app]);

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
  const handleChatSend = useCallback(async (text: string) => {
    const ts = new Date().toISOString();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: ts };
    const aiId = `a-${Date.now() + 1}`;
    const aiMsg: ChatMessage   = { id: aiId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setChatMessages(prev => [...prev, userMsg, aiMsg]);
    setChatWaiting(true);
    chatAccumulatedRef.current = '';

    chatAbortRef.current = new AbortController();

    // 末尾の空アシスタントメッセージを除いた会話履歴
    const history = [...chatMessages, userMsg].map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await streamChat(
      history,
      'あなたは Thinktank の AI アシスタントです。ユーザーの Think（メモ・アイデア）の整理や分析を日本語で手伝ってください。',
      {
        onDelta: (delta) => {
          chatAccumulatedRef.current += delta;
          const accumulated = chatAccumulatedRef.current;
          setChatMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: accumulated } : m));
        },
        onDone:  () => { setChatWaiting(false); },
        onError: (message) => {
          setChatMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: `[エラー] ${message}` } : m,
          ));
          setChatWaiting(false);
        },
      },
      chatAbortRef.current.signal,
    );
  }, [chatMessages]);

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
        thinks={sortedAllThinks}
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
    content = <AiChatView ref={aiChatViewRef} messages={chatMessages} isWaiting={chatWaiting} onSend={handleChatSend} />;
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
        onOpen={handleOpenThought}
        onToggleCheck={handleToggleCheck}
      />
    );
  }

  return (
    <div className="thinktank-area">
      <div className="panel-title-row thinktank-area__title-row">
        Thinktank&gt;{THINKTANK_MODE_NAMES[panel.ViewMode] ?? panel.ViewMode}
      </div>
      <ThinktankMenuRibbon
        viewMode={panel.ViewMode}
        visibleIds={visibleIds}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={panel.ShowCheckedOnly}
        allVaultChecked={allVaultChecked}
        showDateFilter={showDateFilter}
        showColumnDialog={showColumnDialog}
        canCreateThought={canCreateThought}
        canSaveChat={chatMessages.length > 0 && !chatWaiting}
        onScrollPrev={handleScrollPrev}
        onScrollNext={handleScrollNext}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onToggleAllVault={handleToggleAllVault}
        onToggleDateFilter={handleToggleDateFilter}
        onToggleColumnDialog={handleToggleColumnDialog}
        onCreateThought={handleCreateThought}
        onSaveChat={handleSaveChat}
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
          panel.ViewMode === 'filter' ? filterVisible.length :
          thoughtsVisible.length
        }
        totalCount={
          panel.ViewMode === 'search' ? searchResults.length :
          panel.ViewMode === 'filter' ? allThinks.length :
          allThoughts.length
        }
        showTextFilter={panel.ViewMode !== 'ai'}
        showDateFilters={showDateFilter && ['thoughts', 'filter', 'search'].includes(panel.ViewMode)}
      />

      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
