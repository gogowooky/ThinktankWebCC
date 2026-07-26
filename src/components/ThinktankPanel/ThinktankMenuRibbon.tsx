/**
 * ThinktankMenuRibbon.tsx
 * ThinktankArea 上部の横向きリボン
 */

import { useCallback } from 'react';
import { CheckSquare, Square, Trash2, ListCheck, ArrowDownAZ, LayoutList, LibrarySquare, Save, ListRestart, SquareX } from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './ThinktankMenuRibbon.css';

interface Props {
  viewMode:              string;
  visibleIds:            string[];
  checkedIds:            string[];
  showCheckedOnly:       boolean;
  showColumnDialog:      boolean;
  showFilterSelectDialog: boolean;
  canCreateThought:      boolean;
  canSaveChat:           boolean;
  saveChatTip:           string;
  visibleCount?:         number;
  totalCount?:           number;
  onCheckAll:            () => void;
  onClearChecks:         () => void;
  onDeleteChecked:       () => void;
  onToggleCheckedOnly:   () => void;
  onToggleColumnDialog:  () => void;
  onToggleFilterSelectDialog: () => void;
  onCreateThought:       () => void;
  onSaveChat:            () => void;
  onClearTodoSelection:  () => void;
  onRefresh:             () => void;
}

export function ThinktankMenuRibbon({
  viewMode,
  visibleIds, checkedIds, showCheckedOnly,
  showColumnDialog, showFilterSelectDialog,
  canCreateThought, canSaveChat, saveChatTip,
  visibleCount, totalCount,
  onCheckAll, onClearChecks, onDeleteChecked,
  onToggleCheckedOnly,
  onToggleColumnDialog, onToggleFilterSelectDialog,
  onCreateThought, onSaveChat, onClearTodoSelection, onRefresh,
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

  /* ── AI モード: 保存ボタン＋Think一覧共通の表示設定ボタン ──── */
  if (viewMode === 'chat') {
    return (
      <div className="menu-ribbon thinktank-menu-ribbon">
        <div className="tooltip-wrapper" data-tip={saveChatTip} data-tip-side="right">
          <button
            className="menu-ribbon__btn menu-ribbon__btn--icon"
            onClick={onSaveChat}
            disabled={!canSaveChat}
          >
            <Save size={14} />
          </button>
        </div>

        <div className="menu-ribbon__sep" />

        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onRefresh}
          data-tip="表示更新"
          data-tip-side="right"
        >
          <ListRestart size={14} />
        </button>

        <button
          className={`menu-ribbon__btn menu-ribbon__btn--icon${showColumnDialog ? ' menu-ribbon__btn--active' : ''}`}
          onClick={onToggleColumnDialog}
          data-tip="表示項目とソート"
        >
          <ArrowDownAZ size={14} />
        </button>

        <button
          className={`menu-ribbon__btn menu-ribbon__btn--icon${showFilterSelectDialog ? ' menu-ribbon__btn--active' : ''}`}
          onClick={onToggleFilterSelectDialog}
          data-tip="フィルター選択"
        >
          <LayoutList size={14} />
        </button>

        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onClearTodoSelection}
          data-tip="アイテム選択をクリア"
          data-tip-side="left"
        >
          <SquareX size={14} />
        </button>
      </div>
    );
  }

  /* ── 通常モード ─────────────────────────────────────────── */
  return (
    <div className="menu-ribbon thinktank-menu-ribbon">

      {/* 表示更新（左寄せ）*/}
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onRefresh}
        data-tip="表示更新"
        data-tip-side="right"
      >
        <ListRestart size={14} />
      </button>

      {/* CheckToggle: 表示中を全選択 / 全クリア */}
      <div className="tooltip-wrapper" data-tip={allChecked ? '全チェックをクリア' : '表示中を全てチェック'} data-tip-side="right">
        <button
          className={`menu-ribbon__btn menu-ribbon__btn--icon${allChecked ? ' menu-ribbon__btn--active' : ''}`}
          onClick={handleToggleAll}
          disabled={visibleIds.length === 0}
        >
          {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
      </div>

      {/* CheckSelect: チェックのみ表示 */}
      <div className="tooltip-wrapper" data-tip="チェック済みアイテムのみ表示">
        <button
          className={`menu-ribbon__btn menu-ribbon__btn--icon${showCheckedOnly ? ' menu-ribbon__btn--active' : ''}`}
          onClick={onToggleCheckedOnly}
          disabled={!hasChecked && !showCheckedOnly}
        >
          <ListCheck size={14} />
        </button>
      </div>

      {/* ColumnSort: 表示項目とソート設定 */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showColumnDialog ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleColumnDialog}
        data-tip="表示項目とソート"
      >
        <ArrowDownAZ size={14} />
      </button>

      {/* FilterSelect: フィルター欄の表示/非表示設定 */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showFilterSelectDialog ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleFilterSelectDialog}
        data-tip="フィルター選択"
      >
        <LayoutList size={14} />
      </button>

      {/* ChecktoThought: Thought作成 */}
      <div className="tooltip-wrapper" data-tip="チェックアイテムからthoughtを作成">
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onCreateThought}
          disabled={!canCreateThought}
        >
          <LibrarySquare size={14} />
        </button>
      </div>

      {/* CheckDelete: 削除 */}
      <div className="tooltip-wrapper" data-tip="チェック中のアイテムを削除" data-tip-side="left">
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon menu-ribbon__btn--danger"
          onClick={onDeleteChecked}
          disabled={!hasChecked}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="menu-ribbon__spacer" />

      {/* チェック数カウント */}
      {hasChecked && (
        <span className="thinktank-ribbon__check-count">
          {visibleChecked}/{checkedIds.length}
        </span>
      )}

      {/* 表示件数 / 全件数（右寄せ）*/}
      {totalCount !== undefined && (
        <span className="thinktank-ribbon__count">
          {visibleCount ?? totalCount}/{totalCount}
        </span>
      )}

    </div>
  );
}
