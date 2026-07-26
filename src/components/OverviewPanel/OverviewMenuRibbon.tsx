/**
 * OverviewMenuRibbon.tsx
 * OverviewArea 上部の横向きリボン。
 * ThinktankMenuRibbon と同等のボタン群を持つ。
 */

import { useCallback } from 'react';
import {
  CheckSquare, Square, ListX, ListCheck, SquareX,
  ArrowDownAZ, Save, ListRestart,
} from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './OverviewMenuRibbon.css';
import type { TodoMemoOption } from '../ThinktankPanel/ThinktankMenuRibbon';

interface Props {
  showSettings:         boolean;
  mediaType:            string;
  visibleIds:           string[];
  checkedIds:           string[];
  showCheckedOnly:      boolean;
  showColumnDialog:     boolean;
  canSaveChat:          boolean;
  saveChatTip:          string;
  todoMemoOptions:      TodoMemoOption[];
  selectedTodoMemoId:   string;
  visibleCount?:        number;
  totalCount?:          number;
  onSelectTodoMemo:     (id: string) => void;
  onCheckAll:           () => void;
  onClearChecks:        () => void;
  onExcludeChecked:     () => void;
  onClearThought:       () => void;
  onToggleCheckedOnly:  () => void;
  onToggleColumnDialog: () => void;
  onSaveChat:           () => void;
  onRefresh:            () => void;
  hasThought:           boolean;
}

export function OverviewMenuRibbon({
  showSettings,
  mediaType,
  visibleIds, checkedIds, showCheckedOnly,
  showColumnDialog,
  canSaveChat, saveChatTip,
  todoMemoOptions, selectedTodoMemoId,
  visibleCount, totalCount,
  hasThought,
  onSelectTodoMemo,
  onCheckAll, onClearChecks, onExcludeChecked, onClearThought,
  onToggleCheckedOnly,
  onToggleColumnDialog,
  onSaveChat, onRefresh,
}: Props) {
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.includes(id));
  const hasChecked = checkedIds.length > 0;

  const handleToggleAll = useCallback(() => {
    if (allChecked) onClearChecks();
    else            onCheckAll();
  }, [allChecked, onCheckAll, onClearChecks]);

  const visibleChecked = checkedIds.filter(id => visibleIds.includes(id)).length;

  /* ── 設定モード / チャット・グラフモード ───────────────────── */
  if (showSettings || mediaType === 'chat' || mediaType === 'graph') {
    const showChatControls = !showSettings && mediaType === 'chat';
    return (
      <div className="menu-ribbon overview-menu-ribbon">
        {showChatControls && (
          <>
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
              className="overview-ribbon__todo-select"
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
          </>
        )}

        {!showChatControls && <div className="menu-ribbon__spacer" />}

        {/* 表示更新 */}
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

  return (
    <div className="menu-ribbon overview-menu-ribbon">

      {/* 表示更新（左寄せ）*/}
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onRefresh}
        data-tip="表示更新"
        data-tip-side="right"
      >
        <ListRestart size={14} />
      </button>

      <div className="tooltip-wrapper" data-tip={allChecked ? '全チェックをクリア' : '表示中を全てチェック'} data-tip-side="right">
        <button
          className={`menu-ribbon__btn menu-ribbon__btn--icon${allChecked ? ' menu-ribbon__btn--active' : ''}`}
          onClick={handleToggleAll}
          disabled={visibleIds.length === 0}
        >
          {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
      </div>

      <div className="tooltip-wrapper" data-tip="チェック済みアイテムのみ表示">
        <button
          className={`menu-ribbon__btn menu-ribbon__btn--icon${showCheckedOnly ? ' menu-ribbon__btn--active' : ''}`}
          onClick={onToggleCheckedOnly}
          disabled={!hasChecked && !showCheckedOnly}
        >
          <ListCheck size={14} />
        </button>
      </div>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showColumnDialog ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleColumnDialog}
        data-tip="表示項目とソート"
      >
        <ArrowDownAZ size={14} />
      </button>

      {/* チェック中のアイテムをThoughtから除外（作成と削除の間）*/}
      <div className="tooltip-wrapper" data-tip="チェック中のアイテムをThoughtから除外">
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon overview-ribbon__btn--danger"
          onClick={onExcludeChecked}
          disabled={!hasChecked}
        >
          <ListX size={14} />
        </button>
      </div>

      {/* Thought設定クリア */}
      <div className="tooltip-wrapper" data-tip="Thought設定をクリア" data-tip-side="left">
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon"
          onClick={onClearThought}
          disabled={!hasThought}
        >
          <SquareX size={14} />
        </button>
      </div>

      <div className="menu-ribbon__spacer" />

      {hasChecked && (
        <span className="overview-ribbon__check-count">
          {visibleChecked}/{checkedIds.length}
        </span>
      )}

      {/* 表示件数 / 全件数（右寄せ）*/}
      {totalCount !== undefined && (
        <span className="overview-ribbon__check-count">
          {visibleCount ?? totalCount}/{totalCount}
        </span>
      )}

    </div>
  );
}
