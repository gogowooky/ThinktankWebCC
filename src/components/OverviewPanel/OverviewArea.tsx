/**
 * OverviewArea.tsx
 * OverviewPanel の表示エリア。
 *
 * - メニューリボン: ThinktankMenuRibbon 相当のボタン群
 * - Thought ストリップ: 選択中 Thought 名表示 + D&D ドロップターゲット
 * - フィルター / 日付フィルターバー: Think一覧モード(filter)のみ表示
 * - ColumnSortDialog
 * - 本体:
 *   - settings  → OverviewSettingsView（Thought プロファイル）
 *   - filter    → 選択 Thought 内の Think 一覧（datagrid メディアで描画）
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
import { applySort, applyDateFilter } from '../../utils/sortUtils';
import type { DateFilterState } from '../../utils/sortUtils';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import type { ChatMessage, ContentType } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import { parseThought, serializeThought, serializeChat } from '../../utils/thinkFormat';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import './OverviewArea.css';

const ALL_CONTENT_TYPES: ContentType[] = ['memo', 'thought', 'table', 'links', 'chat', 'nettext'];

const OVERVIEW_MODE_NAMES: Record<string, string> = {
  filter: 'Think一覧',
  graph:  'Thought分析',
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

  const handleScrollPrev = useCallback(() => aiChatViewRef.current?.scrollToPrevUser(), []);
  const handleScrollNext = useCallback(() => aiChatViewRef.current?.scrollToNextUser(), []);

  // ── Think 一覧（選択 Thought 内の全 Think → フィルタ適用）──────────────────
  const [thinksInThought, setThinksInThought] = useState(() =>
    panel.ThoughtID ? vault.GetThinksForThought(panel.ThoughtID) : []
  );
  useEffect(() => {
    if (!panel.ThoughtID) { setThinksInThought([]); return; }
    vault.GetThinksForThoughtAsync(panel.ThoughtID).then(newThinks => {
      setThinksInThought(newThinks);
      vault.NotifyUpdated();
    });
  }, [panel.ThoughtID, vault, refreshKey, vault.IsLoaded, vault.Count]);

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  const dateFilter = useMemo<DateFilterState>(() => ({
    show: true,
    createdDate, createdRange, updatedDate, updatedRange,
  }), [createdDate, createdRange, updatedDate, updatedRange]);

  const checkedSet = useMemo(() => new Set(panel.CheckedThoughtIDs), [panel.CheckedThoughtIDs]);

  // 母集合: 検索語があれば検索結果、なければ選択 Thought 内の Think
  const searchBase = (searchSearched && searchQuery.trim() !== '') ? searchResults : thinksInThought;

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

  // Overview.Filter.CursorPos アクションが行番号を解決するための一覧スナップショット
  useEffect(() => {
    panel.FilteredThoughts = visibleThinks;
  }, [panel, visibleThinks]);

  const allVaultChecked = useMemo(
    () => thinksInThought.length > 0 && thinksInThought.every(t => checkedSet.has(t.ID)),
    [thinksInThought, checkedSet],
  );

  // ── ThoughtID 変化時: 一覧状態リセット ＋ MetaOnly なら Content をロード ─
  const prevThoughtIdRef = useRef(panel.ThoughtID);
  useEffect(() => {
    if (panel.ThoughtID === prevThoughtIdRef.current) return;
    prevThoughtIdRef.current = panel.ThoughtID;
    setFilter('');
    panel.SetCheckedThoughtIDs([]);
    setShowCheckedOnly(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchSearched(false);

    if (!panel.ThoughtID) return;
    const thought = vault.GetThink(panel.ThoughtID);
    if (thought?.IsMetaOnly) {
      thought.LoadContent().then(() => vault.NotifyUpdated());
    }
  }, [panel.ThoughtID, vault]);

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
    if (!panel.ThoughtID) return;
    const thought = vault.GetThink(panel.ThoughtID);
    if (!thought) return;

    thought.LoadContent(true)
      .then(() => {
        return vault.GetThinksForThoughtAsync(panel.ThoughtID);
      })
      .then(newThinks => {
        setThinksInThought(newThinks);
        vault.NotifyUpdated();
      })
      .catch(e => {
        console.error('[OverviewArea] refresh failed:', e);
      });
  }, [panel.ThoughtID, vault]);

  // ── メニューリボン ハンドラ ────────────────────────────────────────────────

  const handleCheckAll = useCallback(() => {
    panel.SetCheckedThoughtIDs(visibleIds);
  }, [visibleIds, panel]);

  const handleClearChecks = useCallback(() => panel.SetCheckedThoughtIDs([]), [panel]);

  const handleExcludeChecked = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0 || !panel.ThoughtID) return;
    const thought = vault.GetThink(panel.ThoughtID);
    if (!thought || thought.ContentType !== 'thought') return;
    if (thought.IsMetaOnly) await thought.LoadContent();
    
    const parsed = parseThought(thought.Content);
    const remaining = parsed.ids.filter(id => !panel.CheckedThoughtIDs.includes(id));
    const currentExcludes = parsed.excludeIds || [];
    const newExcludes = Array.from(new Set([...currentExcludes, ...panel.CheckedThoughtIDs]));

    const newContent = serializeThought({
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
    
    thought.Content = newContent;

    if (thought.RelatedIDs) {
      const relIds = thought.RelatedIDs.split(',').filter(id => id.trim());
      const newRelIds = relIds.filter(id => !panel.CheckedThoughtIDs.includes(id));
      thought.RelatedIDs = newRelIds.join(',');
    }

    await thought.SaveContent();

    // 更新後のThink一覧を再取得してステートを更新し、変更を通知する
    const newThinks = await vault.GetThinksForThoughtAsync(panel.ThoughtID);
    setThinksInThought(newThinks);
    vault.NotifyUpdated();

    panel.SetCheckedThoughtIDs([]);
  }, [panel, vault]);

  const handleToggleAllVault = useCallback(() => {
    const allChecked = thinksInThought.length > 0 && thinksInThought.every(t => checkedSet.has(t.ID));
    panel.SetCheckedThoughtIDs(allChecked ? [] : thinksInThought.map(t => t.ID));
  }, [thinksInThought, checkedSet, panel]);

  const handleCreateThought = useCallback(async () => {
    if (panel.CheckedThoughtIDs.length === 0) return;
    const think = await vault.CreateThoughtFromIds(panel.CheckedThoughtIDs, filter);
    panel.SetCheckedThoughtIDs([]);
    app.OpenThought(think.ID);
  }, [panel, vault, filter, app]);

  const handleToggleCheckedOnly   = useCallback(() => setShowCheckedOnly(v => !v), []);
  const handleToggleColumnDialog  = useCallback(() => setShowColumnDialog(v => !v), []);

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
    const aiMsg: ChatMessage   = { id: aiId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setChatMessages(prev => [...prev, userMsg, aiMsg]);
    setChatWaiting(true);
    chatAccumulatedRef.current = '';

    chatAbortRef.current = new AbortController();

    // 選択中 Thought のコンテキストをシステムプロンプトに含める
    const thoughtThink = panel.ThoughtID ? vault.GetThink(panel.ThoughtID) : null;
    const contextLines: string[] = [
      'あなたは Thinktank の AI アシスタントです。ユーザーの Thought（テーマ集合）について分析・整理・提案を日本語で行ってください。',
    ];
    if (thoughtThink) {
      contextLines.push(`\n## 選択中の Thought\nタイトル: ${thoughtThink.Name}`);
      const thinksInThoughtNow = vault.GetThinksForThought(panel.ThoughtID);
      if (thinksInThoughtNow.length > 0) {
        contextLines.push(
          '含まれる Think:\n' + thinksInThoughtNow.map(t => `- ${t.Name}`).join('\n'),
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
            m.id === aiId ? { ...m, content: `[エラー] ${message}` } : m,
          ));
          setChatWaiting(false);
        },
      },
      chatAbortRef.current.signal,
    );
  }, [chatMessages, panel, vault]);

  const handleSaveChat = useCallback(async () => {
    if (chatMessages.length === 0) return;
    const firstUser = chatMessages.find(m => m.role === 'user')?.content ?? '';
    const title = firstUser.slice(0, 50) || `Chat ${new Date().toLocaleDateString('ja-JP')}`;
    const body = serializeChat(chatMessages);
    await vault.CreateChatThink(`${title}\n${body}`, panel.ThoughtID ?? undefined);
    setChatMessages([]);
  }, [chatMessages, vault, panel]);

  // ── 算出値 ────────────────────────────────────────────────────────────────
  const think = panel.ThoughtID ? vault.GetThink(panel.ThoughtID) ?? null : null;
  const isThinkListMode = panel.MediaType === 'datagrid' && !showSettings;

  const overviewModeLabel = showSettings
    ? '設定'
    : (OVERVIEW_MODE_NAMES[panel.MediaType] ?? panel.MediaType);

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
        allVaultChecked={allVaultChecked}
        showColumnDialog={showColumnDialog}
        canSaveChat={chatMessages.length > 0 && !chatWaiting}
        visibleCount={visibleThinks.length}
        totalCount={typeFilteredBase.length}
        hasThought={!!panel.ThoughtID}
        onScrollPrev={handleScrollPrev}
        onScrollNext={handleScrollNext}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onExcludeChecked={handleExcludeChecked}
        onClearThought={() => panel.ClearThought()}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onCreateThought={handleCreateThought}
        onToggleAllVault={handleToggleAllVault}
        onToggleColumnDialog={handleToggleColumnDialog}
        onSaveChat={handleSaveChat}
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

      {/* ── フィルターパネル + 検索バー（Think一覧モードのみ）────────── */}
      {isThinkListMode && (
        <>
          <OverviewFilterPanel
            ref={filterPanelRef}
            historyKey="ov-filter"
            textValue={filter}
            onTextChange={setFilter}
            createdDate={createdDate}
            onCreatedDateChange={setCreatedDate}
            createdRange={createdRange}
            onCreatedRangeChange={setCreatedRange}
            updatedDate={updatedDate}
            onUpdatedDateChange={setUpdatedDate}
            updatedRange={updatedRange}
            onUpdatedRangeChange={setUpdatedRange}
            showDateFilters={true}
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
          />
        </>
      )}

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="overview-area__body">
        {showSettings ? (
          <OverviewSettingsView ref={settingsViewRef} think={think} vault={vault} onClear={() => panel.ClearThought()} />
        ) : isThinkListMode ? (
          !panel.ThoughtID ? (
            <div className="overview-area__empty">
              <span>Thought をドロップして選択してください</span>
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
          <AiChatView ref={aiChatViewRef} messages={chatMessages} isWaiting={chatWaiting} onSend={handleChatSend} />
        ) : !think ? (
          <div className="overview-area__empty">
            <span>Thought をドロップして選択してください</span>
          </div>
        ) : panel.MediaType === 'graph' ? (
          <GraphMedia ref={graphMediaRef} think={think} vault={vault} onSave={noop} onDirtyChange={noop} />
        ) : null}
      </div>

    </div>
  );
}
