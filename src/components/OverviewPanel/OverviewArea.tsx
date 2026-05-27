/**
 * OverviewArea.tsx
 * OverviewPanel の表示エリア。
 *
 * - メニューリボン: ThinktankMenuRibbon 相当のボタン群
 * - Thought ストリップ: 選択中 Thought 名表示 + D&D ドロップターゲット
 * - フィルター / 日付フィルターバー: Think一覧モード(datagrid)のみ表示
 * - ColumnSortDialog
 * - 本体:
 *   - settings  → OverviewSettingsView（Thought プロファイル）
 *   - datagrid  → 選択 Thought 内の Think 一覧
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
import { UnifiedFilterPanel } from '../ThinktankPanel/UnifiedFilterPanel';
import type { UnifiedFilterPanelRef } from '../ThinktankPanel/UnifiedFilterPanel';
import { ThinktankSearchBar } from '../ThinktankPanel/ThinktankSearchBar';
import { ThoughtsList, applyFilter } from '../ThinktankPanel/ThoughtsList';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import { applySort, applyDateFilter } from '../../utils/sortUtils';
import type { DateFilterState } from '../../utils/sortUtils';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import type { ChatMessage, ContentType } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import './OverviewArea.css';

const ALL_CONTENT_TYPES: ContentType[] = ['memo', 'thought', 'table', 'links', 'chat', 'nettext'];

const OVERVIEW_MODE_NAMES: Record<string, string> = {
  datagrid: 'Think一覧',
  graph:    'Thought分析',
  chat:     'AI相談',
};

const noop = () => {};

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
  const [checkedIds,       setCheckedIds]       = useState<string[]>([]);
  const [showCheckedOnly,  setShowCheckedOnly]  = useState(false);
  const [createdDate,      setCreatedDate]      = useState('');
  const [createdRange,     setCreatedRange]     = useState('');
  const [updatedDate,      setUpdatedDate]      = useState('');
  const [updatedRange,     setUpdatedRange]     = useState('');
  const [columns,          setColumns]          = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,             setSort]             = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

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
  const filterPanelRef                  = useRef<UnifiedFilterPanelRef>(null);
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
    vault.GetThinksForThoughtAsync(panel.ThoughtID).then(setThinksInThought);
  }, [panel.ThoughtID, vault, refreshKey]);

  // ── メモ化済み計算 ────────────────────────────────────────────────────────

  const dateFilter = useMemo<DateFilterState>(() => ({
    show: true,
    createdDate, createdRange, updatedDate, updatedRange,
  }), [createdDate, createdRange, updatedDate, updatedRange]);

  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);

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
    setCheckedIds([]);
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
    app.RefreshAll().catch(e => console.error('[OverviewArea] RefreshAll failed:', e));
  }, [app]);

  // ── メニューリボン ハンドラ ────────────────────────────────────────────────

  const handleCheckAll = useCallback(() => {
    setCheckedIds(visibleIds);
  }, [visibleIds]);

  const handleClearChecks = useCallback(() => setCheckedIds([]), []);

  const handleExcludeChecked = useCallback(async () => {
    if (checkedIds.length === 0 || !panel.ThoughtID) return;
    const thought = vault.GetThink(panel.ThoughtID);
    if (!thought || thought.ContentType !== 'thought') return;
    if (thought.IsMetaOnly) await thought.LoadContent();
    const remaining = thought.getThinkIds().filter(id => !checkedIds.includes(id));
    const nonIdLines = thought.Content.split('\n').filter(l => !l.startsWith('* '));
    thought.Content = [...nonIdLines, ...remaining.map(id => `* ${id}`)].join('\n');
    await thought.SaveContent();
    setCheckedIds([]);
  }, [checkedIds, panel.ThoughtID, vault]);

  const handleToggleAllVault = useCallback(() => {
    const allChecked = thinksInThought.length > 0 && thinksInThought.every(t => checkedSet.has(t.ID));
    setCheckedIds(allChecked ? [] : thinksInThought.map(t => t.ID));
  }, [thinksInThought, checkedSet]);

  const handleCreateThought = useCallback(async () => {
    if (checkedIds.length === 0) return;
    const think = await vault.CreateThoughtFromIds(checkedIds, filter);
    setCheckedIds([]);
    app.OpenThought(think.ID);
  }, [checkedIds, vault, filter, app]);

  const handleToggleCheckedOnly   = useCallback(() => setShowCheckedOnly(v => !v), []);
  const handleToggleColumnDialog  = useCallback(() => setShowColumnDialog(v => !v), []);

  const handleDeleteChecked = useCallback(async () => {
    if (checkedIds.length === 0) return;
    if (!window.confirm(`${checkedIds.length} 件を削除しますか？`)) return;
    app.RemoveThinksFromWorkout(checkedIds);
    await vault.DeleteThinks(checkedIds);
    setCheckedIds([]);
  }, [app, vault, checkedIds]);

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

  const handleToggleCheck = useCallback((id: string | string[], force?: boolean) => {
    const ids = Array.isArray(id) ? id : [id];
    setCheckedIds(prev => {
      const nextSet = new Set(prev);
      ids.forEach(tid => {
        const next = (force !== undefined) ? force : !nextSet.has(tid);
        if (next) nextSet.add(tid);
        else nextSet.delete(tid);
      });
      return Array.from(nextSet);
    });
  }, []);

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
    const body = chatMessages.map(m => m.role === 'user' ? `## ${m.content}` : m.content).join('\n');
    await vault.CreateChatThink(`${title}\n${body}`, panel.ThoughtID ?? undefined);
    setChatMessages([]);
  }, [chatMessages, vault, panel]);

  // ── 算出値 ────────────────────────────────────────────────────────────────
  const think = panel.ThoughtID ? vault.GetThink(panel.ThoughtID) ?? null : null;
  const isThinkListMode = panel.MediaType === 'datagrid';

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
        checkedIds={checkedIds}
        showCheckedOnly={showCheckedOnly}
        allVaultChecked={allVaultChecked}
        showColumnDialog={showColumnDialog}
        canSaveChat={chatMessages.length > 0 && !chatWaiting}
        visibleCount={visibleThinks.length}
        totalCount={typeFilteredBase.length}
        onScrollPrev={handleScrollPrev}
        onScrollNext={handleScrollNext}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onExcludeChecked={handleExcludeChecked}
        onDeleteChecked={handleDeleteChecked}
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
          <UnifiedFilterPanel
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
          <ThinktankSearchBar
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
              checkedIds={checkedIds}
              columns={columns}
              onOpen={handleOpenThinkInWorkout}
              onToggleCheck={handleToggleCheck}
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
