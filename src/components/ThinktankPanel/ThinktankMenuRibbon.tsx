/**
 * ThinktankMenuRibbon.tsx
 * ThinktankArea 上部の横向きリボン
 */

import { useCallback } from 'react';
import { CheckSquare, Square, Trash2, ListCheck, ArrowDownAZ, LibrarySquare, Save, ListRestart } from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './ThinktankMenuRibbon.css';

export interface TodoMemoOption {
  id:   string;
  name: string;
}

interface Props {
  viewMode:              string;
  visibleIds:            string[];
  checkedIds:            string[];
  showCheckedOnly:       boolean;
  showColumnDialog:      boolean;
  canCreateThought:      boolean;
  canSaveChat:           boolean;
  saveChatTip:           string;
  visibleCount?:         number;
  totalCount?:           number;
  todoMemoOptions:       TodoMemoOption[];
  selectedTodoMemoId:    string;
  onCheckAll:            () => void;
  onClearChecks:         () => void;
  onDeleteChecked:       () => void;
  onToggleCheckedOnly:   () => void;
  onToggleColumnDialog:  () => void;
  onCreateThought:       () => void;
  onSaveChat:            () => void;
  onSelectTodoMemo:      (id: string) => void;
  onRefresh:             () => void;
}

export function ThinktankMenuRibbon({
  viewMode,
  visibleIds, checkedIds, showCheckedOnly,
  showColumnDialog,
  canCreateThought, canSaveChat, saveChatTip,
  visibleCount, totalCount,
  todoMemoOptions, selectedTodoMemoId,
  onCheckAll, onClearChecks, onDeleteChecked,
  onToggleCheckedOnly,
  onToggleColumnDialog,
  onCreateThought, onSaveChat, onSelectTodoMemo, onRefresh,
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

  /* ── AI モード: 保存ボタン＋TODOメモ選択 ────────────────── */
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
        <select
          className="thinktank-ribbon__todo-select"
          value={selectedTodoMemoId}
          onChange={e => onSelectTodoMemo(e.target.value)}
          data-tip="TODOメモを選択してChatに読み込み"
          data-tip-side="left"
        >
          <option value=""></option>
          {todoMemoOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onRefresh}
          data-tip="表示更新"
          data-tip-side="left"
        >
          <ListRestart size={14} />
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
