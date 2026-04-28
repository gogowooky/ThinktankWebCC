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

import { useCallback, useState } from 'react';
import { BookOpen, CalendarDays, CalendarClock } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TTThink } from '../../models/TTThink';
import { OverviewMenuRibbon } from './OverviewMenuRibbon';
import { OverviewSettingsView } from './OverviewSettingsView';
import { GraphMedia } from '../WorkoutPanel/media/GraphMedia';
import { AiChatView } from '../ThinktankPanel/AiChatView';
import { ThoughtsFilter } from '../ThinktankPanel/ThoughtsFilter';
import { ThoughtsList, applyFilter } from '../ThinktankPanel/ThoughtsList';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import { computeDateRange, parseRange } from '../ThinktankPanel/ThinktankFilterView';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import type { ChatMessage } from '../../types';
import './OverviewArea.css';

const noop = () => {};

interface Props {
  app:          TTApplication;
  showSettings: boolean;
}

export function OverviewArea({ app, showSettings }: Props) {
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

  // ── ソート / 日付フィルター ────────────────────────────────────────────────

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

  // ── Think 一覧（選択 Thought 内の全 Think → フィルタ適用）──────────────────
  const thinksInThought = panel.ThoughtID
    ? vault.GetThinksForThought(panel.ThoughtID)
    : [];

  const visibleThinks = applySort(applyDateFilter(
    applyFilter(
      showCheckedOnly ? thinksInThought.filter(t => checkedIds.includes(t.ID)) : thinksInThought,
      filter
    )
  ));

  // ── Thought 選択（D&D）────────────────────────────────────────────────────
  const selectThought = useCallback((id: string) => {
    panel.OpenThought(id, panel.MediaType);
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
    // Thought（ContentType='thought'）のみ ThoughtPlace に設定する
    const dropped = vault.GetThink(id);
    if (!dropped || dropped.ContentType === 'thought') selectThought(id);
  }, [selectThought, vault]);

  // ── メニューリボン ハンドラ ────────────────────────────────────────────────

  const handleCheckAll = useCallback(() => {
    setCheckedIds(visibleThinks.map(t => t.ID));
  }, [visibleThinks]);

  const handleClearChecks = useCallback(() => setCheckedIds([]), []);

  const handleDeleteChecked = useCallback(async () => {
    if (checkedIds.length === 0) return;
    if (!window.confirm(`${checkedIds.length} 件を削除しますか？`)) return;
    await vault.DeleteThinks(checkedIds);
    setCheckedIds([]);
  }, [checkedIds, vault]);

  const handleToggleAllVault = useCallback(() => {
    const allIds = thinksInThought.map(t => t.ID);
    const allCheckedV = allIds.length > 0 && allIds.every(id => checkedIds.includes(id));
    setCheckedIds(allCheckedV ? [] : allIds);
  }, [thinksInThought, checkedIds]);

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

  const handleToggleCheck = useCallback((id: string) => {
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

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
    await vault.CreateChatThink(`${title}\n${body}`, panel.ThoughtID ?? undefined);
    setChatMessages([]);
  }, [chatMessages, vault, panel]);

  // ── 算出値 ────────────────────────────────────────────────────────────────
  const think = panel.ThoughtID ? vault.GetThink(panel.ThoughtID) ?? null : null;
  const isThinkListMode = panel.MediaType === 'datagrid';

  const allVaultIds     = thinksInThought.map(t => t.ID);
  const allVaultChecked = allVaultIds.length > 0 && allVaultIds.every(id => checkedIds.includes(id));

  const createdRangeInvalid = createdRange.trim() !== '' && !parseRange(createdRange.trim());
  const updatedRangeInvalid = updatedRange.trim() !== '' && !parseRange(updatedRange.trim());

  return (
    <div className="overview-area">

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <OverviewMenuRibbon
        visibleIds={visibleThinks.map(t => t.ID)}
        checkedIds={checkedIds}
        showCheckedOnly={showCheckedOnly}
        allVaultChecked={allVaultChecked}
        showDateFilter={showDateFilter}
        showColumnDialog={showColumnDialog}
        hasChatMessages={chatMessages.length > 0}
        onCheckAll={handleCheckAll}
        onClearChecks={handleClearChecks}
        onDeleteChecked={handleDeleteChecked}
        onToggleCheckedOnly={handleToggleCheckedOnly}
        onCreateThought={handleCreateThought}
        onToggleAllVault={handleToggleAllVault}
        onToggleDateFilter={handleToggleDateFilter}
        onToggleColumnDialog={handleToggleColumnDialog}
        onSaveChat={handleSaveChat}
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
        <BookOpen size={11} className="overview-area__strip-icon" />
        {think
          ? <span className="overview-area__strip-name">{think.Name || '（無題）'}</span>
          : <span className="overview-area__strip-placeholder">Thought をドロップして選択</span>
        }
      </div>

      {/* ── フィルターバー（Think一覧モードのみ）────────────────── */}
      {isThinkListMode && (
        <>
          <ThoughtsFilter
            value={filter}
            onChange={setFilter}
            visibleCount={visibleThinks.length}
            totalCount={thinksInThought.length}
          />

          {showDateFilter && (
            <div className="overview-area__date-bars">
              <div className="overview-area__bar">
                <CalendarDays size={12} className="overview-area__bar-icon" />
                <input
                  className="overview-area__bar-date"
                  type="date"
                  title="作成日(ID)"
                  value={createdDate}
                  onChange={e => setCreatedDate(e.target.value)}
                />
                <input
                  className={`overview-area__bar-range${createdRangeInvalid ? ' overview-area__bar-range--invalid' : ''}`}
                  type="text"
                  placeholder="+Nd"
                  title="範囲: +3d(以降) / -1m(以前) / +-2w(前後)  指定なし=1日"
                  value={createdRange}
                  onChange={e => setCreatedRange(e.target.value)}
                />
              </div>
              <div className="overview-area__bar">
                <CalendarClock size={12} className="overview-area__bar-icon" />
                <input
                  className="overview-area__bar-date"
                  type="date"
                  title="更新日"
                  value={updatedDate}
                  onChange={e => setUpdatedDate(e.target.value)}
                />
                <input
                  className={`overview-area__bar-range${updatedRangeInvalid ? ' overview-area__bar-range--invalid' : ''}`}
                  type="text"
                  placeholder="+Nd"
                  title="範囲: +3d(以降) / -1m(以前) / +-2w(前後)  指定なし=1日"
                  value={updatedRange}
                  onChange={e => setUpdatedRange(e.target.value)}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="overview-area__body">
        {showSettings ? (
          <OverviewSettingsView think={think} vault={vault} />
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
              onSelect={id => app.OpenThinkInWorkout(id)}
              onToggleCheck={handleToggleCheck}
            />
          )
        ) : panel.MediaType === 'chat' ? (
          <AiChatView messages={chatMessages} isWaiting={chatWaiting} onSend={handleChatSend} />
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
