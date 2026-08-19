/**
 * ThinktankArea.tsx
 * ThinktankPanel のコンテンツエリア。
 * ViewMode に応じて表示を切り替える。
 *
 * Think一覧（filter）モードは「検索」「Bundle一覧」を統合したもの:
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
import { ThinktankFilterPanel } from './ThinktankFilterPanel';
import type { ThinktankFilterPanelRef } from './ThinktankFilterPanel';
import { ThinktankFilterView } from './ThinktankFilterView';
import { ThinktankSearchBar } from './ThinktankSearchBar';
import { applySort } from '../../utils/sortUtils';
import { AiChatView } from './AiChatView';
import type { AiChatViewRef } from './AiChatView';
import type { ChatMessage, ContentType } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import { aiSpeakerPrefix } from '../../services/aiModels';
import { ThinktankSettingsView } from './ThinktankSettingsView';
import type { ThinktankSettingsViewRef } from './ThinktankSettingsView';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from './ColumnSortDialog';
import type { ColumnConfig, SortConfig } from './ColumnSortDialog';
import { FilterSelectDialog, DEFAULT_FILTER_VISIBILITY, DEFAULT_CHAT_FILTER_VISIBILITY } from './FilterSelectDialog';
import type { FilterVisibility } from './FilterSelectDialog';
import { ThinktankChatMemoPicker } from './ThinktankChatMemoPicker';
import {
  serializeChat, isTodoChatThink, loadChatFromThink, chatContentTitle,
  NEW_CHAT_SENTINEL_ID, TODO_CHAT_PREFIX_THINKTANK,
} from '../../utils/thinkFormat';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { addContentSearchKeywordToHighlighter, addTitleSearchKeywordToHighlighter } from '../../utils/highlighterKeyword';
import './ThinktankArea.css';

import type { LayoutMode } from '../Layout/AppLayout';

const THINKTANK_MODE_NAMES: Record<string, string> = {
  filter:   'Think一覧',
  chat:     'AI相談',
  settings: '設定',
};

const ALL_CONTENT_TYPES: ContentType[] = ['memo', 'bundle', 'table', 'links', 'chat', 'nettext'];

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

  // Simpleモード時にchatモードが選択されていたらfilterに切り替える
  if (layoutMode === 'simple' && panel.ViewMode === 'chat') {
    panel.SetViewMode('filter');
  }

  // filter モードの可視アイテムとタイトルクエリはコールバックで受け取る
  const [filterVisible,    setFilterVisible]    = useState<TTThink[]>([]);
  const [filterTitleQuery, setFilterTitleQuery] = useState('');

  const [focusedId, setFocusedId] = useState<string | null>(() => panel.CurrentItemID || null);

  // 外部からの CurrentItem.ID の変更イベントを監視・同期
  useEffect(() => {
    const handleKeyChange = (key: string, val: string) => {
      setFocusedId(val || null);
    };
    TTUIStateManager.instance.addListener('ThinktankPanel.CurrentItem.ID', handleKeyChange);
    return () => {
      TTUIStateManager.instance.removeListener('ThinktankPanel.CurrentItem.ID', handleKeyChange);
    };
  }, []);

  useEffect(() => {
    setFocusedId(panel.CurrentItemID || null);
  }, [panel.CurrentItemID]);

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

  // フィルター欄の表示/非表示設定（Think一覧用。AI相談モードは種別なし・タイトルのみデフォルトの別state）
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_FILTER_VISIBILITY);
  const [chatFilterVisibility, setChatFilterVisibility] = useState<FilterVisibility>(DEFAULT_CHAT_FILTER_VISIBILITY);
  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  // 日付フィルター state（常時表示）
  const [createdDate,  setCreatedDate]  = useState('');
  const [createdRange, setCreatedRange] = useState('');
  const [updatedDate,  setUpdatedDate]  = useState('');
  const [updatedRange, setUpdatedRange] = useState('');

  // 一覧表示する種別（初期はBundleのみON）
  const [visibleTypes, setVisibleTypes] = useState<Set<ContentType>>(() => new Set(['bundle']));

  // チャット state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWaiting,  setChatWaiting]  = useState(false);
  const chatAbortRef                    = useRef<AbortController | null>(null);
  const chatAccumulatedRef              = useRef('');
  const aiChatViewRef                   = useRef<AiChatViewRef>(null);
  const [selectedTodoMemoId, setSelectedTodoMemoId] = useState('');

  const filterPanelRef   = useRef<ThinktankFilterPanelRef>(null);
  const settingsViewRef  = useRef<ThinktankSettingsViewRef>(null);
  const pendingSearchQueryRef = useRef<string | null>(null);

  // panel.Filter / panel.ContentFilter が外部からセットされたとき各フィールドに反映する
  useEffect(() => {
    if (!panel.Filter && !panel.ContentFilter) return;
    // すべての欄を一旦クリア
    setFilterTitleQuery('');
    setSearchQuery('');
    setSearchResults([]);
    setSearchSearched(false);
    setCreatedDate('');
    setCreatedRange('');
    setUpdatedDate('');
    setUpdatedRange('');
    // 種別フィルターと値をセット
    const types = panel.FilterVisibleTypes
      ? new Set(panel.FilterVisibleTypes)
      : new Set(ALL_CONTENT_TYPES);
    setVisibleTypes(types);
    if (panel.Filter) {
      setFilterTitleQuery(panel.Filter);
    }
    if (panel.ContentFilter) {
      const q = panel.ContentFilter;
      setSearchQuery(q);
      pendingSearchQueryRef.current = q;
    }
    panel.ClearFilter();
  }, [panel.Filter, panel.ContentFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 全種別検索フラグの監視
  useEffect(() => {
    if (panel.ShouldResetTypesToAll) {
      panel.ShouldResetTypesToAll = false;
      setVisibleTypes(new Set(ALL_CONTENT_TYPES));
    }
  }, [panel.ShouldResetTypesToAll, panel]);

  // 検索 state（ビュー切り替えで消えないよう ThinktankArea で保持）
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<TTThink[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  // vault.Count が変わったとき（追加・削除）のみ再取得
  const allThinks = useMemo(() => vault.GetThinks(), [vault.Count]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI相談 DataGrid 用: タイトルが TODO:Thinktank で始まる chat Think 一覧（大文字小文字を区別しない）
  const todoMemoThinks = useMemo(
    () => allThinks.filter(t => isTodoChatThink(t, TODO_CHAT_PREFIX_THINKTANK)),
    [allThinks],
  );

  // 選択中の TODO メモが一覧から消えたら選択を空に戻す
  useEffect(() => {
    if (selectedTodoMemoId && !todoMemoThinks.some(t => t.ID === selectedTodoMemoId)) {
      setSelectedTodoMemoId('');
    }
  }, [todoMemoThinks, selectedTodoMemoId]);

  // 母集合: 検索語があれば検索結果、なければ全 Think
  const searchBase = (searchSearched && searchQuery.trim() !== '') ? searchResults : allThinks;

  // 種別フィルター → ソート（タイトル/日付/チェックは FilterView 側で適用）
  const typeFilteredBase = useMemo(
    () => searchBase.filter(t => visibleTypes.has(t.ContentType)),
    [searchBase, visibleTypes],
  );
  const sortedBase = useMemo(() => applySort(typeFilteredBase, sort), [typeFilteredBase, sort]);

  // chat / settings 以外はすべて Think一覧（filter）として扱う（旧モードの残存値対策）
  const isFilterMode = panel.ViewMode !== 'chat' && panel.ViewMode !== 'settings';

  const visibleThinks = isFilterMode ? filterVisible : [];
  const visibleIds = useMemo(() => visibleThinks.map(t => t.ID), [visibleThinks]);

  // Thinktank.Filter.CursorPos アクションが行番号を解決するための一覧スナップショット
  useEffect(() => {
    panel.FilteredThoughts = visibleThinks;
  }, [panel, visibleThinks]);

  // ── ハンドラ ─────────────────────────────────────────────────────────────

  const handleSelect = useCallback((id: string) => {
    const bundleId = app.OverviewPanel.BundleID;
    if (bundleId) {
      const thinks = vault.GetThinksForBundle(bundleId);
      if (!thinks.some(t => t.ID === id)) return;
    }
    app.OpenThinkInWorkout(id);
  }, [app, vault]);

  // Bundle 種別はその場で Overview へ、それ以外は Workout へ
  const handleOpenItem = useCallback((id: string) => {
    const t = vault.GetThink(id);
    if (t?.ContentType === 'bundle') {
      app.OpenBundle(id, 'datagrid');
    } else {
      handleSelect(id);
    }
  }, [app, vault, handleSelect]);

  const handleFocusChange = useCallback((id: string | null) => {
    const nextVal = id || '';
    if (panel.CurrentItemID !== nextVal) {
      panel.CurrentItemID = nextVal;
      setFocusedId(nextVal || null);
      TTUIStateManager.instance.notifyPropertyChanged('ThinktankPanel.CurrentItem.ID');
    }
  }, [panel]);

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

  const handleToggleFilterSelectDialog = useCallback(() => {
    setShowFilterSelectDialog(v => !v);
  }, []);

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

  const canCreateBundle = true;

  const handleCreateBundle = useCallback(async () => {
    const dates = { createdDate, createdRange, updatedDate, updatedRange };
    if (searchSearched && searchQuery.trim() !== '') {
      await vault.CreateBundleFromSearch(searchQuery.trim(), panel.CheckedThoughtIDs, dates);
    } else {
      await vault.CreateBundleFromFilter(filterTitleQuery.trim(), panel.CheckedThoughtIDs, dates);
    }
    panel.ClearChecks();
  }, [panel, vault, searchSearched, searchQuery, filterTitleQuery, createdDate, createdRange, updatedDate, updatedRange]);

  // チャット送信・保存
  const handleChatSend = useCallback(async (text: string) => {
    const ts = new Date().toISOString();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: ts };
    const aiId = `a-${Date.now() + 1}`;
    // AI発言はどのモデルの回答かが本文に残るよう「(モデル名)」の1行で始める
    const aiPrefix = aiSpeakerPrefix({ provider: panel.AIChatProvider, model: panel.AIChatModel });
    const aiMsg: ChatMessage   = { id: aiId, role: 'assistant', content: aiPrefix, timestamp: new Date().toISOString() };

    setChatMessages(prev => [...prev, userMsg, aiMsg]);
    setChatWaiting(true);
    chatAccumulatedRef.current = aiPrefix;

    chatAbortRef.current = new AbortController();

    const history = [...chatMessages, userMsg].map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await streamChat(
      history,
      'あなたは Thinktank の AI アシスタントである Antigravity です。ユーザーの Think（メモ・アイデア）の整理や分析を日本語で手伝ってください。',
      {
        onDelta: (delta) => {
          chatAccumulatedRef.current += delta;
          const accumulated = chatAccumulatedRef.current;
          setChatMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: accumulated } : m));
        },
        onDone:  (metadata) => {
          setChatWaiting(false);
          if (metadata?.createdFileId) {
            onRefresh();
            const targetId = metadata.createdFileId;
            const cat = metadata.category;
            setTimeout(() => {
              if (cat === 'bundle') {
                app.OpenBundle(targetId, 'datagrid');
              } else {
                app.OpenThinkInWorkout(targetId);
              }
            }, 600);
          }
        },
        onError: (message) => {
          setChatMessages(prev => prev.map(m =>
            m.id === aiId ? { ...m, content: `${aiPrefix}[エラー] ${message}` } : m,
          ));
          setChatWaiting(false);
        },
      },
      chatAbortRef.current.signal,
      { provider: panel.AIChatProvider, model: panel.AIChatModel },
    );
  }, [chatMessages, panel]);

  // 選択中のThinkがあればそこへ上書き保存、なければ新規の chat Think として保存する
  const handleSaveChat = useCallback(async () => {
    if (chatMessages.length === 0) return;

    if (selectedTodoMemoId) {
      const think = vault.GetThink(selectedTodoMemoId);
      if (!think) return;
      const firstLine = think.Content.split('\n')[0] ?? '';
      const body = serializeChat(chatMessages);
      think.Content = firstLine ? `${firstLine}\n${body}` : body;
      await think.SaveContent();
      return;
    }

    const title = chatContentTitle(TODO_CHAT_PREFIX_THINKTANK, chatMessages);
    const body = serializeChat(chatMessages);
    const think = await vault.CreateChatThink(`${title}\n${body}`);
    setSelectedTodoMemoId(think.ID);
  }, [chatMessages, vault, selectedTodoMemoId]);

  const saveChatTip = selectedTodoMemoId
    ? `Chatを${selectedTodoMemoId}に保管します`
    : 'Chatを新規のchatとして保管します';

  // chatファイル選択: 選択されたchatファイルの内容をChatにロードする（空選択でクリア）。
  // 「新規チャット」行が選ばれた場合もファイルは作らず、空選択と同じ「未保存の新規チャット」状態にする。
  // ファイルとして保存されるのは、保存ボタンが押された時（handleSaveChat）だけ
  const handleSelectTodoMemo = useCallback(async (id: string) => {
    chatAbortRef.current?.abort();
    setChatWaiting(false);

    const targetId = id === NEW_CHAT_SENTINEL_ID ? '' : id;
    setSelectedTodoMemoId(targetId);
    if (!targetId) { setChatMessages([]); return; }
    const think = vault.GetThink(targetId);
    if (think?.IsMetaOnly) await think.LoadContent();
    setChatMessages(loadChatFromThink(think));
  }, [vault]);

  // 検索実行
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    addContentSearchKeywordToHighlighter(q);
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

  // pendingSearchQueryRef がセットされていて searchQuery が一致したら検索実行
  useEffect(() => {
    if (pendingSearchQueryRef.current !== null && searchQuery === pendingSearchQueryRef.current) {
      pendingSearchQueryRef.current = null;
      handleSearch();
    }
  }, [searchQuery, handleSearch]);

  // タイトル絞り込み実行（Enter確定時）
  const handleTitleFilterSearch = useCallback(() => {
    const q = filterTitleQuery.trim();
    if (!q) return;
    addTitleSearchKeywordToHighlighter(q);
  }, [filterTitleQuery]);

  // ── モード別コンテンツ ───────────────────────────────────────────────────

  let content: React.ReactNode;

  if (panel.ViewMode === 'chat') {
    content = (
      <div className="thinktank-area__chat-wrap">
        <ThinktankChatMemoPicker
          thinks={todoMemoThinks}
          columns={columns}
          sort={sort}
          filterVisibility={chatFilterVisibility}
          selectedId={selectedTodoMemoId}
          onSelect={handleSelectTodoMemo}
          checkedIds={panel.CheckedThoughtIDs}
          onToggleCheck={(id, force) => panel.ToggleCheck(id, force)}
        />
        <div className="thinktank-area__chat-body">
          <AiChatView
            ref={aiChatViewRef}
            messages={chatMessages}
            isWaiting={chatWaiting}
            onSend={handleChatSend}
            modelSelector={{
              value:    { provider: panel.AIChatProvider, model: panel.AIChatModel },
              onChange: (selection) => panel.SetAIChatModel(selection),
            }}
          />
        </div>
      </div>
    );
  } else if (panel.ViewMode === 'settings') {
    content = <ThinktankSettingsView ref={settingsViewRef} />;
  } else {
    // filter モード（検索・Bundle一覧を統合）
    content = (
      <ThinktankFilterView
        thinks={sortedBase}
        selectedId={panel.SelectedBundleID}
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
        focusedId={focusedId}
        onFocusChange={handleFocusChange}
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
        showColumnDialog={showColumnDialog}
        showFilterSelectDialog={showFilterSelectDialog}
        canCreateBundle={canCreateBundle}
        canSaveChat={chatMessages.length > 0 && !chatWaiting}
        saveChatTip={saveChatTip}
        visibleCount={filterVisible.length}
        totalCount={allThinks.length}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onToggleColumnDialog={handleToggleColumnDialog}
        onToggleFilterSelectDialog={handleToggleFilterSelectDialog}
        onCreateBundle={handleCreateBundle}
        onSaveChat={handleSaveChat}
        onClearTodoSelection={() => handleSelectTodoMemo('')}
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

      {showFilterSelectDialog && (
        panel.ViewMode === 'chat' ? (
          <FilterSelectDialog
            visibility={chatFilterVisibility}
            onChange={setChatFilterVisibility}
            hiddenFields={['type']}
            onClose={() => setShowFilterSelectDialog(false)}
          />
        ) : (
          <FilterSelectDialog
            visibility={filterVisibility}
            onChange={setFilterVisibility}
            onClose={() => setShowFilterSelectDialog(false)}
          />
        )
      )}

      {isFilterMode && (
        <>
          <ThinktankFilterPanel
            ref={filterPanelRef}
            historyKey="tt-filter"
            textValue={filterTitleQuery}
            onTextChange={setFilterTitleQuery}
            onSearch={handleTitleFilterSearch}
            createdDate={createdDate}
            onCreatedDateChange={setCreatedDate}
            createdRange={createdRange}
            onCreatedRangeChange={setCreatedRange}
            updatedDate={updatedDate}
            onUpdatedDateChange={setUpdatedDate}
            updatedRange={updatedRange}
            onUpdatedRangeChange={setUpdatedRange}
            showTextFilter={filterVisibility.title}
            showCreatedDateFilter={filterVisibility.createdDate}
            showUpdatedDateFilter={filterVisibility.updatedDate}
          />
          <ThinktankSearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={handleSearchQueryChange}
            onSearch={handleSearch}
            loading={searchLoading}
            visibleTypes={visibleTypes}
            onToggleType={handleToggleType}
            onSelectAllTypes={handleSelectAllTypes}
            showContentFilter={filterVisibility.content}
            showTypeFilter={filterVisibility.type}
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
