/**
 * OverviewMenuRibbon.tsx
 * OverviewArea 上部の横向きリボン。
 * ThinktankMenuRibbon と同等のボタン群を持つ。
 */

import { useCallback } from 'react';
import {
  CheckSquare, Square, ListX, ListCheck, LibrarySquare,
  ListChecks, List, CalendarDays, ArrowDownAZ, Save, MonitorUp, MonitorDown,
} from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './OverviewMenuRibbon.css';

interface Props {
  showSettings:         boolean;
  mediaType:            string;
  visibleIds:           string[];
  checkedIds:           string[];
  showCheckedOnly:      boolean;
  allVaultChecked:      boolean;
  showDateFilter:       boolean;
  showColumnDialog:     boolean;
  canSaveChat:          boolean;
  onScrollPrev:         () => void;
  onScrollNext:         () => void;
  onCheckAll:           () => void;
  onClearChecks:        () => void;
  onExcludeChecked:     () => void;
  onToggleCheckedOnly:  () => void;
  onCreateThought:      () => void;
  onToggleAllVault:     () => void;
  onToggleDateFilter:   () => void;
  onToggleColumnDialog: () => void;
  onSaveChat:           () => void;
}

export function OverviewMenuRibbon({
  showSettings,
  mediaType,
  visibleIds, checkedIds, showCheckedOnly, allVaultChecked,
  showDateFilter, showColumnDialog,
  canSaveChat,
  onScrollPrev, onScrollNext,
  onCheckAll, onClearChecks, onExcludeChecked,
  onToggleCheckedOnly, onCreateThought, onToggleAllVault,
  onToggleDateFilter, onToggleColumnDialog,
  onSaveChat,
}: Props) {
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.includes(id));
  const hasChecked = checkedIds.length > 0;

  const handleToggleAll = useCallback(() => {
    if (allChecked) onClearChecks();
    else            onCheckAll();
  }, [allChecked, onCheckAll, onClearChecks]);

  const visibleChecked = checkedIds.filter(id => visibleIds.includes(id)).length;

  /* ── 設定モード: ボタンなし ─────────────────────────────── */
  if (showSettings) {
    return <div className="menu-ribbon overview-menu-ribbon" />;
  }

  /* ── チャットモード: 保存ボタンのみ ─────────────────────── */
  if (mediaType === 'chat') {
    return (
      <div className="menu-ribbon overview-menu-ribbon">
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

  return (
    <div className="menu-ribbon overview-menu-ribbon">

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${allChecked ? ' menu-ribbon__btn--active' : ''}`}
        onClick={handleToggleAll}
        data-tip={allChecked ? '全チェックをクリア' : '表示中を全てチェック'}
        disabled={visibleIds.length === 0}
      >
        {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${allVaultChecked ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleAllVault}
        data-tip={allVaultChecked ? '全チェックをクリア' : '全アイテムをチェック（非表示含む）'}
      >
        {allVaultChecked ? <ListChecks size={14} /> : <List size={14} />}
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showCheckedOnly ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleCheckedOnly}
        data-tip="チェック済みアイテムのみ表示"
        disabled={!hasChecked && !showCheckedOnly}
      >
        <ListCheck size={14} />
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showDateFilter ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleDateFilter}
        data-tip={showDateFilter ? '日付フィルターを非表示' : '日付フィルターを表示'}
      >
        <CalendarDays size={14} />
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showColumnDialog ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleColumnDialog}
        data-tip="表示項目とソート"
      >
        <ArrowDownAZ size={14} />
      </button>

      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onCreateThought}
        data-tip="チェックアイテムからthoughtを作成"
        disabled={!hasChecked}
      >
        <LibrarySquare size={14} />
      </button>

      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon overview-ribbon__btn--danger"
        onClick={onExcludeChecked}
        data-tip="チェック中のアイテムをThoughtから除外"
        disabled={!hasChecked}
      >
        <ListX size={14} />
      </button>

      <div className="menu-ribbon__spacer" />

      {hasChecked && (
        <span className="overview-ribbon__check-count">
          {visibleChecked}/{checkedIds.length}
        </span>
      )}

    </div>
  );
}
