/**
 * SeedsMenuRibbon.tsx
 * SeedsArea 上部の横向きリボン。
 * ThinktankMenuRibbon と同等のボタン群を持つ。
 */

import { useCallback } from 'react';
import {
  CheckSquare, Square, ListX, ListCheck,
  ArrowDownAZ, LayoutList, ListRestart,
} from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './SeedsMenuRibbon.css';

interface Props {
  showSettings:         boolean;
  mediaType:            string;
  visibleIds:           string[];
  checkedIds:           string[];
  showCheckedOnly:      boolean;
  showColumnDialog:     boolean;
  showFilterSelectDialog: boolean;
  visibleCount?:        number;
  totalCount?:          number;
  onCheckAll:           () => void;
  onClearChecks:        () => void;
  onExcludeChecked:     () => void;
  onToggleCheckedOnly:  () => void;
  onToggleColumnDialog: () => void;
  onToggleFilterSelectDialog: () => void;
  onRefresh:            () => void;
}

export function SeedsMenuRibbon({
  showSettings,
  mediaType,
  visibleIds, checkedIds, showCheckedOnly,
  showColumnDialog, showFilterSelectDialog,
  visibleCount, totalCount,
  onCheckAll, onClearChecks, onExcludeChecked,
  onToggleCheckedOnly,
  onToggleColumnDialog, onToggleFilterSelectDialog,
  onRefresh,
}: Props) {
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.includes(id));
  const hasChecked = checkedIds.length > 0;

  const handleToggleAll = useCallback(() => {
    if (allChecked) onClearChecks();
    else            onCheckAll();
  }, [allChecked, onCheckAll, onClearChecks]);

  const visibleChecked = checkedIds.filter(id => visibleIds.includes(id)).length;

  /* ── プロジェクト・AIView: AbstractView / AiViewPanel が自前のリボンを持つ ── */
  if (!showSettings && (mediaType === 'project' || mediaType === 'aiview')) return null;

  /* ── 設定・AIChat ──────────────────────────────────────── */
  if (showSettings || mediaType === 'aichat') {
    return (
      <div className="menu-ribbon seeds-menu-ribbon">
        <div className="menu-ribbon__spacer" />

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
    <div className="menu-ribbon seeds-menu-ribbon">

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

      {/* FilterSelect: フィルター欄の表示/非表示設定 */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showFilterSelectDialog ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleFilterSelectDialog}
        data-tip="フィルター選択"
      >
        <LayoutList size={14} />
      </button>

      {/* チェック中のアイテムをBundleから除外（作成と削除の間）*/}
      <div className="tooltip-wrapper" data-tip="チェック中のアイテムをBundleから除外">
        <button
          className="menu-ribbon__btn menu-ribbon__btn--icon seeds-ribbon__btn--danger"
          onClick={onExcludeChecked}
          disabled={!hasChecked}
        >
          <ListX size={14} />
        </button>
      </div>

      <div className="menu-ribbon__spacer" />

      {hasChecked && (
        <span className="seeds-ribbon__check-count">
          {visibleChecked}/{checkedIds.length}
        </span>
      )}

      {/* 表示件数 / 全件数（右寄せ）*/}
      {totalCount !== undefined && (
        <span className="seeds-ribbon__check-count">
          {visibleCount ?? totalCount}/{totalCount}
        </span>
      )}

    </div>
  );
}
