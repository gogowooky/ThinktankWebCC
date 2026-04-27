/**
 * ThinktankMenuRibbon.tsx
 * ThinktankArea 上部の横向きリボン
 */

import { useCallback } from 'react';
import { CheckSquare, Square, Trash2, Filter, BookOpen } from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './ThinktankMenuRibbon.css';

interface Props {
  visibleIds:          string[];
  checkedIds:          string[];
  showCheckedOnly:     boolean;
  onCheckAll:          () => void;
  onClearChecks:       () => void;
  onDeleteChecked:     () => void;
  onToggleCheckedOnly: () => void;
  onCreateThought:     () => void;
}

export function ThinktankMenuRibbon({
  visibleIds, checkedIds, showCheckedOnly,
  onCheckAll, onClearChecks, onDeleteChecked,
  onToggleCheckedOnly, onCreateThought,
}: Props) {
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.includes(id));
  const hasChecked = checkedIds.length > 0;

  const handleToggleAll = useCallback(() => {
    if (allChecked) onClearChecks();
    else            onCheckAll();
  }, [allChecked, onCheckAll, onClearChecks]);

  const visibleChecked = checkedIds.filter(id => visibleIds.includes(id)).length;

  return (
    <div className="menu-ribbon thinktank-menu-ribbon">

      {/* CheckToggle: 全選択 / 全クリア */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${allChecked ? ' menu-ribbon__btn--active' : ''}`}
        onClick={handleToggleAll}
        title={allChecked ? '全チェックをクリア' : '表示中を全てチェック'}
        disabled={visibleIds.length === 0}
      >
        {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>

      {/* CheckSelect: チェックのみ表示 */}
      <button
        className={`menu-ribbon__btn menu-ribbon__btn--icon${showCheckedOnly ? ' menu-ribbon__btn--active' : ''}`}
        onClick={onToggleCheckedOnly}
        title="チェック済みアイテムのみ表示"
        disabled={!hasChecked && !showCheckedOnly}
      >
        <Filter size={14} />
      </button>

      {/* ChecktoThought: Thought作成 */}
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon"
        onClick={onCreateThought}
        title="チェックアイテムからthoughtを作成"
        disabled={!hasChecked}
      >
        <BookOpen size={14} />
      </button>

      {/* CheckDelete: 削除 */}
      <button
        className="menu-ribbon__btn menu-ribbon__btn--icon menu-ribbon__btn--danger"
        onClick={onDeleteChecked}
        title="チェック中のアイテムを削除"
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
