/**
 * OverviewMenuRibbon.tsx
 * OverviewArea 上部の横向きリボン。
 * ThinktankMenuRibbon と同等のボタン群を持つ。
 */

import { useCallback } from 'react';
import {
  CheckSquare, Square, FileMinus, ListCheck, LibrarySquare,
  ListChecks, List, CalendarDays, ArrowDownAZ,
} from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './OverviewMenuRibbon.css';

interface Props {
  visibleIds:           string[];
  checkedIds:           string[];
  showCheckedOnly:      boolean;
  allVaultChecked:      boolean;
  showDateFilter:       boolean;
  showColumnDialog:     boolean;
  onCheckAll:           () => void;
  onClearChecks:        () => void;
  onExcludeChecked:     () => void;
  onToggleCheckedOnly:  () => void;
  onCreateThought:      () => void;
  onToggleAllVault:     () => void;
  onToggleDateFilter:   () => void;
  onToggleColumnDialog: () => void;
}

export function OverviewMenuRibbon({
  visibleIds, checkedIds, showCheckedOnly, allVaultChecked,
  showDateFilter, showColumnDialog,
  onCheckAll, onClearChecks, onExcludeChecked,
  onToggleCheckedOnly, onCreateThought, onToggleAllVault,
  onToggleDateFilter, onToggleColumnDialog,
}: Props) {
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.includes(id));
  const hasChecked = checkedIds.length > 0;

  const handleToggleAll = useCallback(() => {
    if (allChecked) onClearChecks();
    else            onCheckAll();
  }, [allChecked, onCheckAll, onClearChecks]);

  const visibleChecked = checkedIds.filter(id => visibleIds.includes(id)).length;

  return (
    <div className="menu-ribbon overview-menu-ribbon">

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${allChecked ? ' menu-ribbon__btn--active' : ''}`}
        onClick={handleToggleAll}
        title={allChecked ? '全チェックをクリア' : '表示中を全てチェック'}
        disabled={visibleIds.length === 0}
      >
        {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${allVaultChecked ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleAllVault}
        title={allVaultChecked ? '全チェックをクリア' : '全アイテムをチェック（非表示含む）'}
      >
        {allVaultChecked ? <ListChecks size={14} /> : <List size={14} />}
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showCheckedOnly ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleCheckedOnly}
        title="チェック済みアイテムのみ表示"
        disabled={!hasChecked && !showCheckedOnly}
      >
        <ListCheck size={14} />
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showDateFilter ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleDateFilter}
        title={showDateFilter ? '日付フィルターを非表示' : '日付フィルターを表示'}
      >
        <CalendarDays size={14} />
      </button>

      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showColumnDialog ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleColumnDialog}
        title="表示項目とソート"
      >
        <ArrowDownAZ size={14} />
      </button>

      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onCreateThought}
        title="チェックアイテムからthoughtを作成"
        disabled={!hasChecked}
      >
        <LibrarySquare size={14} />
      </button>

      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon overview-ribbon__btn--danger"
        onClick={onExcludeChecked}
        title="チェック中のアイテムをThoughtから除外"
        disabled={!hasChecked}
      >
        <FileMinus size={14} />
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
