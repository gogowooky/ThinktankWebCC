/**
 * ReThinkMenuRibbon.tsx
 * ReThinkArea 上部の横向きリボン
 */

import { Save, ListRestart, ArrowDownAZ, LayoutList, SquareX } from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './ReThinkMenuRibbon.css';

interface Props {
  viewMode:              string;
  canSaveChat:           boolean;
  saveChatTip:           string;
  showColumnDialog:      boolean;
  showFilterSelectDialog: boolean;
  onSaveChat:            () => void;
  onToggleColumnDialog:  () => void;
  onToggleFilterSelectDialog: () => void;
  onClearTodoSelection:  () => void;
  onRefresh:             () => void;
}

export function ReThinkMenuRibbon({
  viewMode, canSaveChat, saveChatTip,
  showColumnDialog, showFilterSelectDialog,
  onSaveChat, onToggleColumnDialog, onToggleFilterSelectDialog,
  onClearTodoSelection, onRefresh,
}: Props) {
  if (viewMode === 'settings') {
    return <div className="menu-ribbon rethink-menu-ribbon" />;
  }

  return (
    <div className="menu-ribbon rethink-menu-ribbon">
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
