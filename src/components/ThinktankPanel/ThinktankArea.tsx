/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 *
 * Think一覧（filter）モードは「検索」「Thought一覧」を統合したもの:
 *   - 上部: タイトル/キーワードによる絞り込み欄
 *   - 日付フィルター（常時表示）
 *   - 全文/AI 検索のキーワード欄＋検索オプション
 *   - 一覧表示する種別（ContentType）の選択ボタン
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TTThink } from '../../models/TTThink';
import { StorageManager } from '../../services/storage/StorageManager';
import { ThinktankMenuRibbon } from './ThinktankMenuRibbon';
import { UnifiedFilterPanel } from './UnifiedFilterPanel';
import type { UnifiedFilterPanelRef } from './UnifiedFilterPanel';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchBar } from './ThinktankSearchBar';
import type { SearchMode } from './ThinktankSearchBar';
import { applySort } from '../../utils/sortUtils';
import { AiChatView } from './AiChatView';
import type { AiChatViewRef } from './AiChatView';
import type { ChatMessage, ContentType } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import { semanticSearch } from '../../services/EmbeddingApiService';
import type { SemanticSearchResult } from '../../services/EmbeddingApiService';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import type { ThinktankSettingsViewRef } from './ThinktankSettingsView';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from './ColumnSortDialog';
import type { ColumnConfig, SortConfig } from './ColumnSortDialog';
import './ThinktankArea.css';

import type { LayoutMode } from '../Layout/AppLayout';

const THINKTANK_MODE_NAMES: Record<string, string> = {
  filter:   'Think一覧',
  chat:     'AI相談',
  settings: '設定',
};

const ALL_CONTENT_TYPES: ContentType[] = ['memo', 'thought', 'table', 'links', 'chat', 'nettext'];

interface Props {
  app: TTApplication;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onRefresh: () => void;
}

export function ThinktankArea({ app, layoutMode, onLayoutModeChange, onRefresh }: Props) {
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

  // 表示カラム・ソート設定
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,    setSort]    = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  // 日付フィルター state（常時表示）
  const [createdDate,  setCreatedDate]  = useState('');
  const [createdRange, setCreatedRange] = useState('');
  const [updatedDate,  setUpdatedDate]  = useState('');
  const [updatedRange, setUpdatedRange] = useState('');

  // 一覧表示する種別（初期は全種別ON）
  const [visibleTypes, setVisibleTypes] = useState<Set<ContentType>>(() => new Set(ALL_CONTENT_TYPES));

  // チャット state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWaiting,  setChatWaiting]  = useState(false);
  const chatAbortRef                    = useRef<AbortController | null>(null);
  const chatAccumulatedRef              = useRef('');
  const aiChatViewRef                   = useRef<AiChatViewRef>(null);

  const handleScrollPrev = useCallback(() => aiChatViewRef.current?.scrollToPrevUser(), []);
  const handleScrollNext = useCallback(() => aiChatViewRef.current?.scrollToNextUser(), []);

  const filterPanelRef   = useRef<UnifiedFilterPanelRef>(null);
  const settingsViewRef  = useRef<ThinktankSettingsViewRef>(null);

  // mode 切り替え時: 適切な入力要素に自動フォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      switch (panel.ViewMode) {
        case 'filter':
          filterPanelRef.current?.focus();
          break;
        case 'chat':
          aiChatViewRef.current?.focus();
          break;
        case 'settings':
          settingsViewRef.current?.focus();
          break;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [panel.ViewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 検索 state（ビュー切り替えで消えないよう ThinktankArea で保持）
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<TTThink[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);
  const [searchMode,     setSearchMode]     = useState<SearchMode>('fulltext');

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  // vault.Count が変わったとき（追加・削除）のみ再取得
  const allThinks = useMemo(() => vault.GetThinks(), [vault.Count]); // eslint-disable-line react-hooks/exhaustive-deps

  // 母集合: 検索語があれば検索結果、なければ全 Think
  const searchBase = (searchSearched && searchQuery.trim() !== '') ? searchResults : allThinks;

  // 種別フィルター → ソート（タイトル/日付/チェックは FilterView 側で適用）
  const typeFilteredBase = useMemo(
    () => searchBase.filter(t => visibleTypes.has(t.ContentType)),
    [searchBase, visibleTypes],
  );
  const sortedBase = useMemo(() => applySort(typeFilteredBase, sort), [typeFilteredBase, sort]);

  const checkedSet = useMemo(
    () => new Set(panel.CheckedThoughtIDs),
    [panel.CheckedThoughtIDs],
  );

  // chat / settings 以外はすべて Think一覧（filter）として扱う（旧モードの残存値対策）
  const isFilterMode = panel.ViewMode !== 'chat' && panel.ViewMode !== 'settings';

  const visibleThinks = isFilterMode ? filterVisible : [];
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

  // Thought 種別はその場で Overview へ、それ以外は Workout へ
  const handleOpenItem = useCallback((id: string) => {
    const t = vault.GetThink(id);
    if (t?.ContentType === 'thought') {
      app.OpenThought(id, 'datagrid');
    } else {
      handleSelect(id);
    }
  }, [app, vault, handleSelect]);

  const handleToggleCheck = useCallback((id: string | string[], force?: boolean) => {
    panel.ToggleCheck(id, force);
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

  const handleToggleAllVault = useCallback(() => {
    const allIds = allThinks.map(t => t.ID);
    const allChecked = allIds.length > 0 && allIds.every(id => checkedSet.has(id));
    if (allChecked) panel.ClearChecks();
    else panel.CheckAll(allIds);
  }, [panel, allThinks, checkedSet]);

  const handleToggleType = useCallback((t: ContentType) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const handleSelectAllTypes = useCallback(() => setVisibleTypes(new Set(ALL_CONTENT_TYPES)), []);
  const handleClearAllTypes  = useCallback(() => setVisibleTypes(new Set()), []);

  const handleSearchQueryChange = useCallback((v: string) => {
    setSearchQuery(v);
    // 入力変更時は検索確定状態を解除（Enter で再検索するまで母集合は全件）
    setSearchSearched(false);
  }, []);

  const canCreateThought = true;

  const handleCreateThought = useCallback(async () => {
    const dates = { createdDate, createdRange, updatedDate, updatedRange };
    if (searchSearched && searchQuery.trim() !== '') {
      await vault.CreateThoughtFromSearch(searchQuery.trim(), panel.CheckedThoughtIDs, dates);
    } else {
      await vault.CreateThoughtFromFilter(filterTitleQuery.trim(), panel.CheckedThoughtIDs, dates);
    }
    panel.ClearChecks();
  }, [panel, vault, searchSearched, searchQuery, filterTitleQuery, createdDate, createdRange, updatedDate, updatedRange]);

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
    setSearchLoading(true);
    try {
      if (searchMode === 'semantic' || searchMode === 'hybrid') {
        const results: SemanticSearchResult[] = await semanticSearch(q, 30, searchMode === 'hybrid');
        const thinks = results.map(r => {
          const existing = vault.GetThink(r.id);
          if (existing) return existing;
          const t = new TTThink();
          t.ID          = r.id;
          t.VaultID     = vault.ID;
          t.ContentType = r.contentType as TTThink['ContentType'];
          t.Keywords    = r.keywords;
          t.RelatedIDs  = r.relatedIds;
          t.IsMetaOnly  = true;
          t.setContentSilent(r.title);
          return t;
        });
        setSearchResults(thinks);
        setSearchSearched(true);
        setSearchLoading(false);
        return;
      }

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
  }, [searchQuery, searchMode, vault]);

  // ── モード別コンテンツ ───────────────────────────────────────────────────

  let content: React.ReactNode;

  if (panel.ViewMode === 'chat') {
    content = <AiChatView ref={aiChatViewRef} messages={chatMessages} isWaiting={chatWaiting} onSend={handleChatSend} />;
  } else if (panel.ViewMode === 'settings') {
    content = <ThinktankSettingsView ref={settingsViewRef} layoutMode={layoutMode} onLayoutModeChange={onLayoutModeChange} />;
  } else {
    // filter モード（検索・Thought一覧を統合）
    content = (
      <ThinktankFilterView
        thinks={sortedBase}
        selectedId={panel.SelectedThoughtID}
        checkedIds={panel.CheckedThoughtIDs}
        checkedOnly={panel.ShowCheckedOnly}
        createdDate={createdDate}
        createdRange={createdRange}
        updatedDate={updatedDate}
        updatedRange={updatedRange}
        columns={columns}
        onOpen={handleOpenItem}
        onToggleCheck={handleToggleCheck}
        onVisibleChange={handleFilterVisibleChange}
        titleQuery={filterTitleQuery}
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
        showColumnDialog={showColumnDialog}
        canCreateThought={canCreateThought}
        canSaveChat={chatMessages.length > 0 && !chatWaiting}
        visibleCount={filterVisible.length}
        totalCount={allThinks.length}
        onScrollPrev={handleScrollPrev}
        onScrollNext={handleScrollNext}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onToggleAllVault={handleToggleAllVault}
        onToggleColumnDialog={handleToggleColumnDialog}
        onCreateThought={handleCreateThought}
        onSaveChat={handleSaveChat}
        onRefresh={onRefresh}
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

      {isFilterMode && (
        <>
          <UnifiedFilterPanel
            ref={filterPanelRef}
            historyKey="tt-filter"
            textValue={filterTitleQuery}
            onTextChange={setFilterTitleQuery}
            createdDate={createdDate}
            onCreatedDateChange={setCreatedDate}
            createdRange={createdRange}
            onCreatedRangeChange={setCreatedRange}
            updatedDate={updatedDate}
            onUpdatedDateChange={setUpdatedDate}
            updatedRange={updatedRange}
            onUpdatedRangeChange={setUpdatedRange}
            showTextFilter={true}
            showDateFilters={true}
          />
          <ThinktankSearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={handleSearchQueryChange}
            onSearch={handleSearch}
            searchMode={searchMode}
            onSearchModeChange={setSearchMode}
            loading={searchLoading}
            visibleTypes={visibleTypes}
            onToggleType={handleToggleType}
            onSelectAllTypes={handleSelectAllTypes}
            onClearAllTypes={handleClearAllTypes}
          />
        </>
      )}

      <div className="thinktank-area__body">
        {content}
      </div>
    </div>
  );
}
