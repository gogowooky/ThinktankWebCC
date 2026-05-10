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
import { Library, X } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { OverviewMenuRibbon } from './OverviewMenuRibbon';
import { OverviewSettingsView } from './OverviewSettingsView';
import { GraphMedia } from '../WorkoutPanel/media/GraphMedia';
import { AiChatView } from '../ThinktankPanel/AiChatView';
import type { AiChatViewRef } from '../ThinktankPanel/AiChatView';
import { UnifiedFilterPanel } from '../ThinktankPanel/UnifiedFilterPanel';
import { ThoughtsList, applyFilter } from '../ThinktankPanel/ThoughtsList';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import { applySort, applyDateFilter } from '../../utils/sortUtils';
import type { DateFilterState } from '../../utils/sortUtils';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import type { ChatMessage } from '../../types';
import { streamChat } from '../../services/ChatApiService';
import './OverviewArea.css';

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

  // ── D&D ─────────────────────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);

  // ── フィルター・チェック state ──────────────────────────────────────────────
  const [filter,           setFilter]           = useState('');
  const [checkedIds,       setCheckedIds]       = useState<string[]>([]);
  const [showCheckedOnly,  setShowCheckedOnly]  = useState(false);
  const [showDateFilter,   setShowDateFilter]   = useState(false);
  const [createdDate,      setCreatedDate]      = useState('');
  const [createdRange,     setCreatedRange]     = useState('');
  const [updatedDate,      setUpdatedDate]      = useState('');
  const [updatedRange,     setUpdatedRange]     = useState('');
  const [columns,          setColumns]          = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,             setSort]             = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

  // ── チャット state ─────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWaiting,  setChatWaiting]  = useState(false);
  const chatAbortRef                    = useRef<AbortController | null>(null);
  const chatAccumulatedRef              = useRef('');
  const aiChatViewRef                   = useRef<AiChatViewRef>(null);

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
    show: showDateFilter,
    createdDate, createdRange, updatedDate, updatedRange,
  }), [showDateFilter, createdDate, createdRange, updatedDate, updatedRange]);

  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);

  const visibleThinks = useMemo(() => {
    const base = showCheckedOnly
      ? thinksInThought.filter(t => checkedSet.has(t.ID))
      : thinksInThought;
    return applySort(applyDateFilter(applyFilter(base, filter), dateFilter), sort);
  }, [thinksInThought, showCheckedOnly, checkedSet, filter, dateFilter, sort]);

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

    if (!panel.ThoughtID) return;
    const thought = vault.GetThink(panel.ThoughtID);
    if (thought?.IsMetaOnly) {
      thought.LoadContent().then(() => vault.NotifyUpdated());
    }
  }, [panel.ThoughtID, vault]);

  // ── Thought 選択（D&D）────────────────────────────────────────────────────
  const selectThought = useCallback((id: string) => {
    panel.OpenThought(id, 'datagrid');
  }, [panel]);

  // ── D&D ハンドラ ─────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-thought-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const id = e.dataTransfer.getData('application/x-thought-id');
    if (!id) return;
    const dropped = vault.GetThink(id);
    if (!dropped || dropped.ContentType === 'thought') selectThought(id);
  }, [selectThought, vault]);
  
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

  const handleToggleDateFilter = useCallback(() => {
    setShowDateFilter(v => {
      if (v) {
        setCreatedDate(''); setCreatedRange('');
        setUpdatedDate(''); setUpdatedRange('');
      }
      return !v;
    });
  }, []);

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
        showDateFilter={showDateFilter}
        showColumnDialog={showColumnDialog}
        canSaveChat={chatMessages.length > 0 && !chatWaiting}
        onScrollPrev={handleScrollPrev}
        onScrollNext={handleScrollNext}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onExcludeChecked={handleExcludeChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onCreateThought={handleCreateThought}
        onToggleAllVault={handleToggleAllVault}
        onToggleDateFilter={handleToggleDateFilter}
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

      {/* ── Thought ストリップ（D&D ターゲット）────────────────── */}
      <div
        className={`overview-area__thought-strip${isDragOver ? ' overview-area__thought-strip--drop' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
          <Library size={11} className="overview-area__strip-icon" />
          {think
            ? <span className="overview-area__strip-name">{think.Name || '（無題）'}</span>
            : <span className="overview-area__strip-placeholder">Thought をドロップして選択</span>
          }
        </div>
        {think && (
          <button
            className="overview-area__strip-clear-btn"
            onClick={(e) => { e.stopPropagation(); panel.ClearThought(); }}
            data-tip="選択解除"
            data-tip-side="bottom"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── フィルターパネル（Think一覧モードのみ）────────────────── */}
      {isThinkListMode && (
        <UnifiedFilterPanel
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
          visibleCount={visibleThinks.length}
          totalCount={thinksInThought.length}
          showDateFilters={showDateFilter}
        />
      )}

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="overview-area__body">
        {showSettings ? (
          <OverviewSettingsView think={think} vault={vault} onClear={() => panel.ClearThought()} />
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
          <GraphMedia think={think} vault={vault} onSave={noop} onDirtyChange={noop} />
        ) : null}
      </div>

    </div>
  );
}
