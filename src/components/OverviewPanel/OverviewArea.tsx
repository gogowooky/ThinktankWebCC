/**
 * OverviewArea.tsx
 * OverviewPanel の表示エリア。
 *
 * - メニューリボン: ThinktankMenuRibbon 相当のボタン群
 * - Bundle ストリップ: 選択中 Bundle 名表示 + D&D ドロップターゲット
 * - フィルター / 日付フィルターバー: Think一覧モード(filter)のみ表示
 * - ColumnSortDialog
 * - 本体:
 *   - settings  → OverviewSettingsView（Bundle プロファイル）
 *   - filter    → 選択 Bundle 内の Think 一覧（datagrid メディアで描画）
 *   - markdown  → MarkdownMedia
 *   - graph     → GraphMedia
 *   - chat      → ChatMedia
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TTThink } from '../../models/TTThink';
import { StorageManager } from '../../services/storage/StorageManager';
import { OverviewMenuRibbon } from './OverviewMenuRibbon';
import { OverviewSettingsView } from './OverviewSettingsView';
import type { OverviewSettingsViewRef } from './OverviewSettingsView';
import { GraphMedia } from '../WorkoutPanel/media/GraphMedia';
import type { GraphMediaRef } from '../WorkoutPanel/media/GraphMedia';
import { AiChatView } from '../ThinktankPanel/AiChatView';
import type { AiChatViewRef } from '../ThinktankPanel/AiChatView';
import { OverviewFilterPanel } from './OverviewFilterPanel';
import type { OverviewFilterPanelRef } from './OverviewFilterPanel';
import { OverviewSearchBar } from './OverviewSearchBar';
import { ThoughtsList, applyFilter } from '../ThinktankPanel/ThoughtsList';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import { FilterSelectDialog, DEFAULT_FILTER_VISIBILITY, DEFAULT_CHAT_FILTER_VISIBILITY } from '../ThinktankPanel/FilterSelectDialog';
import type { FilterVisibility } from '../ThinktankPanel/FilterSelectDialog';
import { ThinktankChatMemoPicker } from '../ThinktankPanel/ThinktankChatMemoPicker';
import { applySort, applyDateFilter } from '../../utils/sortUtils';
import type { DateFilterState } from '../../utils/sortUtils';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import type { ChatMessage, ContentType } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import { aiSpeakerPrefix } from '../../services/aiModels';
import {
  parseBundle, serializeBundle, serializeChat, isTodoChatThink, loadChatFromThink, chatContentTitle,
  NEW_CHAT_SENTINEL_ID, TODO_CHAT_PREFIX_OVERVIEW,
} from '../../utils/thinkFormat';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { addContentSearchKeywordToHighlighter, addTitleSearchKeywordToHighlighter } from '../../utils/highlighterKeyword';
import './OverviewArea.css';

const ALL_CONTENT_TYPES: ContentType[] = ['memo', 'bundle', 'table', 'links', 'chat', 'nettext'];

const OVERVIEW_MODE_NAMES: Record<string, string> = {
  filter: 'Think一覧',
  graph:  'Bundle分析',
  chat:   'AI相談',
};

const noop = () => Promise.resolve();

interface Props {
  app:          TTApplication;
  showSettings: boolean;
  refreshKey?:  number;
}

export function OverviewArea({ app, showSettings, refreshKey }: Props) {
  const panel = app.OverviewPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);

  // ── フィルター・チェック state ──────────────────────────────────────────────
  const [filter,           setFilter]           = useState('');
  const [showCheckedOnly,  setShowCheckedOnly]  = useState(false);
  const [createdDate,      setCreatedDate]      = useState('');
  const [createdRange,     setCreatedRange]     = useState('');
  const [updatedDate,      setUpdatedDate]      = useState('');
  const [updatedRange,     setUpdatedRange]     = useState('');
  const [columns,          setColumns]          = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,             setSort]             = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  // フィルター欄の表示/非表示設定（Think一覧用。AI相談モードは種別なし・タイトルのみデフォルトの別state）
  const [filterVisibility, setFilterVisibility] = useState<FilterVisibility>(DEFAULT_FILTER_VISIBILITY);
  const [chatFilterVisibility, setChatFilterVisibility] = useState<FilterVisibility>(DEFAULT_CHAT_FILTER_VISIBILITY);
  const [showFilterSelectDialog, setShowFilterSelectDialog] = useState(false);

  const [focusedId, setFocusedId] = useState<string | null>(() => panel.CurrentItemID || null);

  // 外部からの CurrentItem.ID の変更イベントを監視・同期
  useEffect(() => {
    const handleKeyChange = (key: string, val: string) => {
      setFocusedId(val || null);
    };
    TTUIStateManager.instance.addListener('OverviewPanel.CurrentItem.ID', handleKeyChange);
    return () => {
      TTUIStateManager.instance.removeListener('OverviewPanel.CurrentItem.ID', handleKeyChange);
    };
  }, []);

  useEffect(() => {
    setFocusedId(panel.CurrentItemID || null);
  }, [panel.CurrentItemID]);

  // 一覧表示する種別（初期は全種別ON）
  const [visibleTypes, setVisibleTypes] = useState<Set<ContentType>>(() => new Set(ALL_CONTENT_TYPES));

  // 検索 state（保管庫全体への全文/AI検索）
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<TTThink[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [searchSearched, setSearchSearched] = useState(false);

  // ── チャット state ─────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWaiting,  setChatWaiting]  = useState(false);
  const chatAbortRef                    = useRef<AbortController | null>(null);
  const chatAccumulatedRef              = useRef('');
  const aiChatViewRef                   = useRef<AiChatViewRef>(null);
  const filterPanelRef                  = useRef<OverviewFilterPanelRef>(null);
  const settingsViewRef                 = useRef<OverviewSettingsViewRef>(null);
  const graphMediaRef                   = useRef<GraphMediaRef>(null);
  const [selectedTodoMemoId, setSelectedTodoMemoId] = useState('');

  // ── Think 一覧（選択 Bundle 内の全 Think → フィルタ適用）──────────────────
  const [thinksInBundle, setThinksInBundle] = useState(() =>
    panel.BundleID ? vault.GetThinksForBundle(panel.BundleID) : []
  );
  useEffect(() => {
    if (!panel.BundleID) { setThinksInBundle([]); return; }
    vault.GetThinksForBundleAsync(panel.BundleID).then(newThinks => {
      setThinksInBundle(newThinks);
      vault.NotifyUpdated();
    });
  }, [panel.BundleID, vault, refreshKey, vault.IsLoaded, vault.Count]);

  // AI相談 DataGrid 用: タイトルが @Overview で始まる chat Think 一覧（Vault全体）
  const allThinks = useMemo(() => vault.GetThinks(), [vault.Count]); // eslint-disable-line react-hooks/exhaustive-deps
  const todoMemoThinks = useMemo(
    () => allThinks.filter(t => isTodoChatThink(t, TODO_CHAT_PREFIX_OVERVIEW)),
    [allThinks],
  );

  // 選択中の TODO メモが一覧から消えたら選択を空に戻す
  useEffect(() => {
    if (selectedTodoMemoId && !todoMemoThinks.some(t => t.ID === selectedTodoMemoId)) {
      setSelectedTodoMemoId('');
    }
  }, [todoMemoThinks, selectedTodoMemoId]);

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  const dateFilter = useMemo<DateFilterState>(() => ({
    show: true,
    createdDate, createdRange, updatedDate, updatedRange,
  }), [createdDate, createdRange, updatedDate, updatedRange]);

  const checkedSet = useMemo(() => new Set(panel.CheckedThoughtIDs), [panel.CheckedThoughtIDs]);

  // 母集合: 検索語があれば検索結果、なければ選択 Bundle 内の Think
  const searchBase = (searchSearched && searchQuery.trim() !== '') ? searchResults : thinksInBundle;

  const typeFilteredBase = useMemo(
    () => searchBase.filter(t => visibleTypes.has(t.ContentType)),
    [searchBase, visibleTypes],
  );

  const visibleThinks = useMemo(() => {
    const base = showCheckedOnly
      ? typeFilteredBase.filter(t => checkedSet.has(t.ID))
      : typeFilteredBase;
    return applySort(applyDateFilter(applyFilter(base, filter), dateFilter), sort);
  }, [typeFilteredBase, showCheckedOnly, checkedSet, filter, dateFilter, sort]);

  const visibleIds = useMemo(() => visibleThinks.map(t => t.ID), [visibleThinks]);

  // OverviewPanel.Filter.CursorPos アクションが行番号を解決するための一覧スナップショット
  useEffect(() => {
    panel.FilteredThoughts = visibleThinks;
  }, [panel, visibleThinks]);


  // ── BundleID 変化時: 一覧状態リセット ＋ MetaOnly なら Content をロード ─
  const prevBundleIdRef = useRef(panel.BundleID);
  useEffect(() => {
    if (panel.BundleID === prevBundleIdRef.current) return;
    prevBundleIdRef.current = panel.BundleID;
    setFilter('');
    panel.SetCheckedThoughtIDs([]);
    setShowCheckedOnly(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchSearched(false);

    if (!panel.BundleID) return;
    const bundle = vault.GetThink(panel.BundleID);
    if (bundle?.IsMetaOnly) {
      bundle.LoadContent().then(() => vault.NotifyUpdated());
    }
  }, [panel.BundleID, vault]);

  // モード切り替え時に対応する入力要素へフォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showSettings) {
        settingsViewRef.current?.focus();
      } else if (panel.MediaType === 'datagrid') {
        filterPanelRef.current?.focus();
      } else if (panel.MediaType === 'chat') {
        aiChatViewRef.current?.focus();
      } else if (panel.MediaType === 'graph') {
        graphMediaRef.current?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [showSettings, panel.MediaType]);

  const handleRefresh = useCallback(() => {
    if (!panel.BundleID) return;
    const bundle = vault.GetThink(panel.BundleID);
    if (!bundle) return;

    bundle.LoadContent(true)
      .then(() => {
        return vault.GetThinksForBundleAsync(panel.BundleID);
      })
      .then(newThinks => {
        setThinksInBundle(newThinks);
        vault.NotifyUpdated();
      })
      .catch(e => {
        console.error('[OverviewArea] refresh failed:', e);
      });
  }, [panel.BundleID, vault]);

  // ── メニューリボン ハンドラ ────────────────────────────────────────────────

  const handleCheckAll = useCallback(() => {
    panel.SetCheckedThoughtIDs(visibleIds);
  }, [visibleIds, panel]);

  const handleClearChecks = useCallback(() => panel.SetCheckedThoughtIDs([]), [panel]);

  const handleExcludeChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0 || !panel.BundleID) return;
    const bundle = vault.GetThink(panel.BundleID);
    if (!bundle || bundle.ContentType !== 'bundle') return;
    if (bundle.IsMetaOnly) await bundle.LoadContent();

    const parsed = parseBundle(bundle.Content);
    const remaining = parsed.ids.filter(id => !panel.CheckedThoughtIDs.includes(id));
    const currentExcludes = parsed.excludeIds || [];
    const newExcludes = Array.from(new Set([...currentExcludes, ...panel.CheckedThoughtIDs]));

    const newContent = serializeBundle({
      prefix: (parsed.search.query || parsed.search.createdRange || parsed.search.updatedRange) ? '>> ' : '> ',
      title: parsed.title,
      searchQuery: parsed.search.query,
      filterKeyword: parsed.filter.keyword,
      dates: {
        createdDate: parsed.filter.createdRange?.dateStr || parsed.search.createdRange?.dateStr,
        createdRange: parsed.filter.createdRange?.rangeStr || parsed.search.createdRange?.rangeStr,
        updatedDate: parsed.filter.updatedRange?.dateStr || parsed.search.updatedRange?.dateStr,
        updatedRange: parsed.filter.updatedRange?.rangeStr || parsed.search.updatedRange?.rangeStr,
      },
      ids: remaining,
      excludeIds: newExcludes,
    });

    bundle.Content = newContent;

    if (bundle.RelatedIDs) {
      const relIds = bundle.RelatedIDs.split(',').filter(id => id.trim());
      const newRelIds = relIds.filter(id => !panel.CheckedThoughtIDs.includes(id));
      bundle.RelatedIDs = newRelIds.join(',');
    }

    await bundle.SaveContent();

    // 更新後のThink一覧を再取得してステートを更新し、変更を通知する
    const newThinks = await vault.GetThinksForBundleAsync(panel.BundleID);
    setThinksInBundle(newThinks);
    vault.NotifyUpdated();

    panel.SetCheckedThoughtIDs([]);
  }, [panel, vault]);

  const handleToggleCheckedOnly   = useCallback(() => setShowCheckedOnly(v => !v), []);
  const handleToggleColumnDialog  = useCallback(() => setShowColumnDialog(v => !v), []);
  const handleToggleFilterSelectDialog = useCallback(() => setShowFilterSelectDialog(v => !v), []);

  const handleDeleteChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    if (!window.confirm(`${panel.CheckedThoughtIDs.length} 件を削除しますか？`)) return;
    app.RemoveThinksFromWorkout(panel.CheckedThoughtIDs);
    await vault.DeleteThinks(panel.CheckedThoughtIDs);
    panel.SetCheckedThoughtIDs([]);
  }, [app, vault, panel]);

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
    setSearchSearched(false);
  }, []);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    addContentSearchKeywordToHighlighter(q);
    setSearchLoading(true);
    try {
      const metas = await StorageManager.instance.search(q);
      setSearchResults(metas.map(meta => {
        const existing = vault.GetThink(meta.id);
        if (existing) return existing;
        const t = new TTThink();
        t.ID = meta.id; t.VaultID = vault.ID;
        t.ContentType = meta.contentType as TTThink['ContentType'];
        t.Keywords = meta.keywords ?? ''; t.RelatedIDs = meta.relatedIds ?? '';
        t.IsMetaOnly = true; t.setContentSilent(meta.title);
        return t;
      }));
    } catch (e) {
      console.error('[OverviewArea] search failed:', e);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
      setSearchSearched(true);
    }
  }, [searchQuery, vault]);

  // タイトル絞り込み実行（Enter確定時）
  const handleTitleFilterSearch = useCallback(() => {
    const q = filter.trim();
    if (!q) return;
    addTitleSearchKeywordToHighlighter(q);
  }, [filter]);

  const handleFocusChange = useCallback((id: string | null) => {
    const nextVal = id || '';
    if (panel.CurrentItemID !== nextVal) {
      panel.CurrentItemID = nextVal;
      setFocusedId(nextVal || null);
      TTUIStateManager.instance.notifyPropertyChanged('OverviewPanel.CurrentItem.ID');
    }
  }, [panel]);

  const handleToggleCheck = useCallback((id: string | string[], force?: boolean) => {
    const ids = Array.isArray(id) ? id : [id];
    const prev = panel.CheckedThoughtIDs;
    const nextSet = new Set(prev);
    ids.forEach(tid => {
      const next = (force !== undefined) ? force : !nextSet.has(tid);
      if (next) nextSet.add(tid);
      else nextSet.delete(tid);
    });
    panel.SetCheckedThoughtIDs(Array.from(nextSet));
  }, [panel]);

  const handleOpenThinkInWorkout = useCallback((id: string) => {
    app.OpenThinkInWorkout(id);
  }, [app]);

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

    // 選択中 Bundle のコンテキストをシステムプロンプトに含める
    const bundleThink = panel.BundleID ? vault.GetThink(panel.BundleID) : null;
    const contextLines: string[] = [
      'あなたは Thinktank の AI アシスタントです。ユーザーの Bundle（テーマ集合）について分析・整理・提案を日本語で行ってください。',
    ];
    if (bundleThink) {
      contextLines.push(`\n## 選択中の Bundle\nタイトル: ${bundleThink.Name}`);
      const thinksInBundleNow = vault.GetThinksForBundle(panel.BundleID);
      if (thinksInBundleNow.length > 0) {
        contextLines.push(
          '含まれる Think:\n' + thinksInBundleNow.map(t => `- ${t.Name}`).join('\n'),
        );
      }
    }
    const systemPrompt = contextLines.join('\n');

    const history = [...chatMessages, userMsg].map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    }));

    await streamChat(
      history,
      systemPrompt,
      {
        onDelta: (delta) => {
          chatAccumulatedRef.current += delta;
          const accumulated = chatAccumulatedRef.current;
          setChatMessages(prev => prev.map(m => m.id === aiId ? { ...m, content: accumulated } : m));
        },
        onDone:  () => { setChatWaiting(false); },
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
  }, [chatMessages, panel, vault]);

  // 選択中のThinkがあればそこへ上書き保存、なければ新規の chat Think として保存する（選択中Bundleへリンク）
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

    const title = chatContentTitle(TODO_CHAT_PREFIX_OVERVIEW, chatMessages);
    const body = serializeChat(chatMessages);
    const think = await vault.CreateChatThink(`${title}\n${body}`, panel.BundleID ?? undefined);
    setSelectedTodoMemoId(think.ID);
  }, [chatMessages, vault, panel, selectedTodoMemoId]);

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

  // ── 算出値 ────────────────────────────────────────────────────────────────
  const think = panel.BundleID ? vault.GetThink(panel.BundleID) ?? null : null;
  const isThinkListMode = panel.MediaType === 'datagrid' && !showSettings;

  const overviewModeLabel = showSettings
    ? '設定'
    : (OVERVIEW_MODE_NAMES[panel.ViewMode] ?? panel.ViewMode);

  return (
    <div className="overview-area">

      {/* ── タイトル行 ────────────────────────────────────────── */}
      <div className="panel-title-row overview-area__title-row">
        Overview&gt;{overviewModeLabel}
      </div>

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <OverviewMenuRibbon
        showSettings={showSettings}
        mediaType={panel.MediaType}
        visibleIds={visibleIds}
        checkedIds={panel.CheckedThoughtIDs}
        showCheckedOnly={showCheckedOnly}
        showColumnDialog={showColumnDialog}
        showFilterSelectDialog={showFilterSelectDialog}
        canSaveChat={chatMessages.length > 0 && !chatWaiting}
        saveChatTip={saveChatTip}
        visibleCount={visibleThinks.length}
        totalCount={typeFilteredBase.length}
        hasBundle={!!panel.BundleID}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onExcludeChecked={handleExcludeChecked}
        onClearBundle={() => panel.ClearBundle()}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onToggleColumnDialog={handleToggleColumnDialog}
        onToggleFilterSelectDialog={handleToggleFilterSelectDialog}
        onSaveChat={handleSaveChat}
        onClearTodoSelection={() => handleSelectTodoMemo('')}
        onRefresh={handleRefresh}
      />

      {/* ── カラムソートダイアログ ─────────────────────────────── */}
      {showColumnDialog && (
        <ColumnSortDialog
          columns={columns}
          sort={sort}
          onColumnsChange={setColumns}
          onSortChange={setSort}
          onClose={() => setShowColumnDialog(false)}
        />
      )}

      {/* ── フィルター選択ダイアログ ───────────────────────────── */}
      {showFilterSelectDialog && (
        panel.MediaType === 'chat' && !showSettings ? (
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

      {/* ── フィルターパネル + 検索バー（Think一覧モードのみ）────────── */}
      {isThinkListMode && (
        <>
          <OverviewFilterPanel
            ref={filterPanelRef}
            historyKey="ov-filter"
            textValue={filter}
            onTextChange={setFilter}
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
          <OverviewSearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={handleSearchQueryChange}
            onSearch={handleSearch}
            loading={searchLoading}
            visibleTypes={visibleTypes}
            onToggleType={handleToggleType}
            onSelectAllTypes={handleSelectAllTypes}
            onClearAllTypes={handleClearAllTypes}
            showContentFilter={filterVisibility.content}
            showTypeFilter={filterVisibility.type}
          />
        </>
      )}

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="overview-area__body">
        {showSettings ? (
          <OverviewSettingsView ref={settingsViewRef} think={think} vault={vault} onClear={() => panel.ClearBundle()} />
        ) : isThinkListMode ? (
          !panel.BundleID ? (
            <div className="overview-area__empty">
              <span>Bundle をドロップして選択してください</span>
            </div>
          ) : (
            <ThoughtsList
              thoughts={visibleThinks}
              selectedId=""
              checkedIds={panel.CheckedThoughtIDs}
              columns={columns}
              onOpen={handleOpenThinkInWorkout}
              onToggleCheck={handleToggleCheck}
              focusedId={focusedId}
              onFocusChange={handleFocusChange}
            />
          )
        ) : panel.MediaType === 'chat' ? (
          <div className="overview-area__chat-wrap">
            <ThinktankChatMemoPicker
              thinks={todoMemoThinks}
              columns={columns}
              sort={sort}
              filterVisibility={chatFilterVisibility}
              selectedId={selectedTodoMemoId}
              onSelect={handleSelectTodoMemo}
              checkedIds={panel.CheckedThoughtIDs}
              onToggleCheck={handleToggleCheck}
            />
            <div className="overview-area__chat-body">
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
        ) : !think ? (
          <div className="overview-area__empty">
            <span>Bundle をドロップして選択してください</span>
          </div>
        ) : panel.MediaType === 'graph' ? (
          <GraphMedia ref={graphMediaRef} think={think} vault={vault} onSave={noop} onDirtyChange={noop} />
        ) : null}
      </div>

    </div>
  );
}
