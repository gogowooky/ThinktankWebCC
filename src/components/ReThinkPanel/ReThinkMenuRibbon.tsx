/**
 * ReThinkMenuRibbon.tsx
 * ReThinkArea 上部の横向きリボン
 */

import { Save } from 'lucide-react';
import '../../components/Layout/MenuRibbon.css';
import './ReThinkMenuRibbon.css';
import type { TodoMemoOption } from '../ThinktankPanel/ThinktankMenuRibbon';

interface Props {
  viewMode:           string;
  canSaveChat:        boolean;
  saveChatTip:        string;
  todoMemoOptions:    TodoMemoOption[];
  selectedTodoMemoId: string;
  onSaveChat:         () => void;
  onSelectTodoMemo:   (id: string) => void;
}

export function ReThinkMenuRibbon({
  viewMode, canSaveChat, saveChatTip,
  todoMemoOptions, selectedTodoMemoId,
  onSaveChat, onSelectTodoMemo,
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
      <select
        className="rethink-ribbon__todo-select"
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
    </div>
  );
}
