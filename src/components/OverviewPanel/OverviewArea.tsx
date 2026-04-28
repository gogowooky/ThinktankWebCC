/**
 * OverviewArea.tsx
 * OverviewPanel の表示エリア。
 *
 * - メニューリボン: ThinktankMenuRibbon 相当のボタン群
 * - Thought セレクター: D&D対応・履歴プルダウン
 * - フィルターバー: タイトルフィルター
 * - 日付フィルターバー（showDateFilter が true のとき）
 * - ColumnSortDialog（showColumnDialog が true のとき）
 * - 本体:
 *   - datagrid → フィルタリング済み Thought 一覧（ThoughtsList）
 *   - markdown → MarkdownMedia（選択 Thought のプロファイル）
 *   - graph    → GraphMedia（関係グラフ）
 *   - chat     → ChatMedia（AI チャット）
 */

import { useCallback, useState } from 'react';
import { BookOpen, CalendarDays, CalendarClock } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TTThink } from '../../models/TTThink';
import { StorageManager } from '../../services/storage/StorageManager';
import { OverviewMenuRibbon } from './OverviewMenuRibbon';
import { MarkdownMedia } from '../WorkoutPanel/media/MarkdownMedia';
import { GraphMedia } from '../WorkoutPanel/media/GraphMedia';
import { ChatMedia } from '../WorkoutPanel/media/ChatMedia';
import { ThoughtsFilter } from '../ThinktankPanel/ThoughtsFilter';
import { ThoughtsList, applyFilter } from '../ThinktankPanel/ThoughtsList';
import { ColumnSortDialog, DEFAULT_COLUMNS, DEFAULT_SORT } from '../ThinktankPanel/ColumnSortDialog';
import { computeDateRange, parseRange } from '../ThinktankPanel/ThinktankFilterView';
import type { ColumnConfig, SortConfig } from '../ThinktankPanel/ColumnSortDialog';
import './OverviewArea.css';

const noop = () => {};

interface HistoryEntry { id: string; name: string; }

interface Props {
  app: TTApplication;
}

export function OverviewArea({ app }: Props) {
  const panel = app.OverviewPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);

  // ── 履歴（セレクター / D&D で選んだ Thought を記録） ───────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // ── フィルター・チェック state ──────────────────────────────────────────────
  const [filter,          setFilter]          = useState('');
  const [checkedIds,      setCheckedIds]      = useState<string[]>([]);
  const [showCheckedOnly, setShowCheckedOnly] = useState(false);
  const [showDateFilter,  setShowDateFilter]  = useState(false);
  const [createdDate,     setCreatedDate]     = useState('');
  const [createdRange,    setCreatedRange]    = useState('');
  const [updatedDate,     setUpdatedDate]     = useState('');
  const [updatedRange,    setUpdatedRange]    = useState('');
  const [columns,         setColumns]         = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [sort,            setSort]            = useState<SortConfig>(DEFAULT_SORT);
  const [showColumnDialog, setShowColumnDialog] = useState(false);

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

  // ── 可視 Thought リスト ───────────────────────────────────────────────────
  const allThoughts = vault.GetThoughts();
  const filteredBase = applyFilter(allThoughts, filter);
  const visibleThoughts = applySort(applyDateFilter(
    showCheckedOnly ? filteredBase.filter(t => checkedIds.includes(t.ID)) : filteredBase
  ));

  // ── Thought 選択（履歴に追加）────────────────────────────────────────────
  const selectThought = useCallback((id: string) => {
    panel.OpenThought(id, panel.MediaType);
    const t = vault.GetThink(id);
    if (t) {
      setHistory(prev => {
        const rest = prev.filter(h => h.id !== id);
        return [{ id, name: t.Name || '（無題）' }, ...rest].slice(0, 20);
      });
    }
  }, [panel, vault]);

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
    if (id) selectThought(id);
  }, [selectThought]);

  // ── メニューリボン ハンドラ ────────────────────────────────────────────────

  const handleCheckAll = useCallback(() => {
    setCheckedIds(visibleThoughts.map(t => t.ID));
  }, [visibleThoughts]);

  const handleClearChecks = useCallback(() => setCheckedIds([]), []);

  const handleDeleteChecked = useCallback(async () => {
    if (checkedIds.length === 0) return;
    if (!window.confirm(`${checkedIds.length} 件を削除しますか？`)) return;
    await vault.DeleteThinks(checkedIds);
    setCheckedIds([]);
  }, [checkedIds, vault]);

  const handleToggleAllVault = useCallback(() => {
    const allIds = vault.GetThinks().map(t => t.ID);
    const allCheckedV = allIds.length > 0 && allIds.every(id => checkedIds.includes(id));
    setCheckedIds(allCheckedV ? [] : allIds);
  }, [vault, checkedIds]);

  const handleCreateThought = useCallback(async () => {
    if (checkedIds.length === 0) return;
    const think = await vault.CreateThoughtFromIds(checkedIds, filter);
    setCheckedIds([]);
    app.OpenThought(think.ID);
  }, [checkedIds, vault, filter, app]);

  const handleToggleCheckedOnly = useCallback(() => setShowCheckedOnly(v => !v), []);

  const handleToggleDateFilter = useCallback(() => {
    setShowDateFilter(v => {
      if (v) {
        setCreatedDate(''); setCreatedRange('');
        setUpdatedDate(''); setUpdatedRange('');
      }
      return !v;
    });
  }, []);

  const handleToggleColumnDialog = useCallback(() => setShowColumnDialog(v => !v), []);

  const handleToggleCheck = useCallback((id: string) => {
    setCheckedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  // ── セレクター表示用の履歴リスト ──────────────────────────────────────────
  const think = panel.ThoughtID ? vault.GetThink(panel.ThoughtID) ?? null : null;

  const displayHistory: HistoryEntry[] =
    panel.ThoughtID && !history.find(h => h.id === panel.ThoughtID) && think
      ? [{ id: think.ID, name: think.Name || '（無題）' }, ...history]
      : history;

  const allVaultIds   = vault.GetThinks().map(t => t.ID);
  const allVaultChecked = allVaultIds.length > 0 && allVaultIds.every(id => checkedIds.includes(id));

  const createdRangeInvalid = createdRange.trim() !== '' && !parseRange(createdRange.trim());
  const updatedRangeInvalid = updatedRange.trim() !== '' && !parseRange(updatedRange.trim());

  return (
    <div className="overview-area">

      {/* ── メニューリボン ─────────────────────────────────────── */}
      <OverviewMenuRibbon
        visibleIds={visibleThoughts.map(t => t.ID)}
        checkedIds={checkedIds}
        showCheckedOnly={showCheckedOnly}
        allVaultChecked={allVaultChecked}
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

      {/* ── Thought セレクター（D&D target）────────────────────── */}
      <div
        className={`overview-area__selector${isDragOver ? ' overview-area__selector--drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <BookOpen size={12} className="overview-area__selector-icon" />
        <select
          className="overview-area__select"
          value={panel.ThoughtID || ''}
          onChange={e => {
            if (e.target.value) selectThought(e.target.value);
            else panel.ClearThought();
          }}
        >
          <option value="">— ドロップ or 履歴から選択 —</option>
          {displayHistory.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      </div>

      {/* ── フィルターバー ──────────────────────────────────────── */}
      <ThoughtsFilter
        value={filter}
        onChange={setFilter}
        visibleCount={visibleThoughts.length}
        totalCount={allThoughts.length}
      />

      {/* ── 日付フィルターバー ──────────────────────────────────── */}
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

      {/* ── 本体 ───────────────────────────────────────────────── */}
      <div className="overview-area__body">
        {panel.MediaType === 'datagrid' ? (
          <ThoughtsList
            thoughts={visibleThoughts}
            selectedId={panel.ThoughtID || ''}
            checkedIds={checkedIds}
            columns={columns}
            onSelect={selectThought}
            onToggleCheck={handleToggleCheck}
          />
        ) : !think ? (
          <div className="overview-area__empty">
            <span>Thought を選択してください</span>
          </div>
        ) : panel.MediaType === 'markdown' ? (
          <MarkdownMedia think={think} vault={vault} onSave={noop} onDirtyChange={noop} />
        ) : panel.MediaType === 'graph' ? (
          <GraphMedia think={think} vault={vault} onSave={noop} onDirtyChange={noop} />
        ) : panel.MediaType === 'chat' ? (
          <ChatMedia think={think} vault={vault} onSave={noop} onDirtyChange={noop} />
        ) : null}
      </div>

    </div>
  );
}
