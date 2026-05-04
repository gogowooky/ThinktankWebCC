/**
 * ThinktankMenuRibbon.tsx
 * ThinktankArea 上部の横向きリボン
 */

import { useCallback } from 'react';
import { CheckSquare, Square, Trash2, ListCheck, ListChecks, List, CalendarDays, ArrowDownAZ, LibrarySquare, Save, MonitorUp, MonitorDown } from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './ThinktankMenuRibbon.css';

interface Props {
  viewMode:              string;
  visibleIds:            string[];
  checkedIds:            string[];
  showCheckedOnly:       boolean;
  allVaultChecked:       boolean;
  showDateFilter:        boolean;
  showColumnDialog:      boolean;
  canCreateThought:      boolean;
  canSaveChat:           boolean;
  onScrollPrev:          () => void;
  onScrollNext:          () => void;
  onCheckAll:            () => void;
  onClearChecks:         () => void;
  onDeleteChecked:       () => void;
  onToggleCheckedOnly:   () => void;
  onToggleAllVault:      () => void;
  onToggleDateFilter:    () => void;
  onToggleColumnDialog:  () => void;
  onCreateThought:       () => void;
  onSaveChat:            () => void;
}

export function ThinktankMenuRibbon({
  viewMode,
  visibleIds, checkedIds, showCheckedOnly, allVaultChecked,
  showDateFilter, showColumnDialog,
  canCreateThought, canSaveChat,
  onScrollPrev, onScrollNext,
  onCheckAll, onClearChecks, onDeleteChecked,
  onToggleCheckedOnly, onToggleAllVault,
  onToggleDateFilter, onToggleColumnDialog,
  onCreateThought, onSaveChat,
}: Props) {
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.includes(id));
  const hasChecked = checkedIds.length > 0;

  const handleToggleAll = useCallback(() => {
    if (allChecked) onClearChecks();
    else            onCheckAll();
  }, [allChecked, onCheckAll, onClearChecks]);

  const visibleChecked = checkedIds.filter(id => visibleIds.includes(id)).length;

  /* ── 設定モード: ボタンなし ─────────────────────────────── */
  if (viewMode === 'settings') {
    return <div className="menu-ribbon thinktank-menu-ribbon" />;
  }

  /* ── AI モード: 保存ボタンのみ ──────────────────────────── */
  if (viewMode === 'ai') {
    return (
      <div className="menu-ribbon thinktank-menu-ribbon">
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onScrollPrev}
          data-tip="前のユーザーメッセージへ"
        >
          <MonitorUp size={14} />
        </button>
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onScrollNext}
          data-tip="次のユーザーメッセージへ"
        >
          <MonitorDown size={14} />
        </button>
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onSaveChat}
          data-tip="Chatを保管庫に保存"
          disabled={!canSaveChat}
        >
          <Save size={14} />
        </button>
      </div>
    );
  }

  /* ── 通常モード ─────────────────────────────────────────── */
  return (
    <div className="menu-ribbon thinktank-menu-ribbon">

      {/* CheckToggle: 表示中を全選択 / 全クリア */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${allChecked ? ' menu-ribbon__btn--active' : ''}`}
        onClick={handleToggleAll}
        data-tip={allChecked ? '全チェックをクリア' : '表示中を全てチェック'}
        disabled={visibleIds.length === 0}
      >
        {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>

      {/* AllVaultCheck: 表示・非表示にかかわらず全アイテムをチェック */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${allVaultChecked ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleAllVault}
        data-tip={allVaultChecked ? '全チェックをクリア' : '全アイテムをチェック（非表示含む）'}
      >
        {allVaultChecked ? <ListChecks size={14} /> : <List size={14} />}
      </button>

      {/* CheckSelect: チェックのみ表示 */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showCheckedOnly ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleCheckedOnly}
        data-tip="チェック済みアイテムのみ表示"
        disabled={!hasChecked && !showCheckedOnly}
      >
        <ListCheck size={14} />
      </button>

      {/* DateFilter: 作成日(ID)・更新日フィルターの表示切替 */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showDateFilter ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleDateFilter}
        data-tip={showDateFilter ? '日付フィルターを非表示' : '日付フィルターを表示'}
      >
        <CalendarDays size={14} />
      </button>

      {/* ColumnSort: 表示項目とソート設定 */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showColumnDialog ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleColumnDialog}
        data-tip="表示項目とソート"
      >
        <ArrowDownAZ size={14} />
      </button>

      {/* ChecktoThought: Thought作成 */}
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onCreateThought}
        data-tip="チェックアイテムからthoughtを作成"
        disabled={!canCreateThought}
      >
        <LibrarySquare size={14} />
      </button>

      {/* CheckDelete: 削除 */}
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon menu-ribbon__btn--danger"
        onClick={onDeleteChecked}
        data-tip="チェック中のアイテムを削除"
        disabled={!hasChecked}
      >
        <Trash2 size={14} />
      </button>

      <div className="menu-ribbon__spacer" />

      {/* チェック数カウント */}
      {hasChecked && (
        <span className="thinktank-ribbon__check-count">
          {visibleChecked}/{checkedIds.length}
        </span>
      )}

    </div>
  );
}
