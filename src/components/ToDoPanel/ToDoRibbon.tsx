/**
 * ToDoRibbon.tsx
 * Phase 10: ToDoPanel の Ribbon。
 *
 * side="right" でパネルの右端に配置。
 * ボタン: AI相談 / 設定 / 会話クリア
 */

import { Trash2, MessageCircle, Settings } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import './ToDoRibbon.css';

export type ToDoViewMode = 'chat' | 'settings';

interface Props {
  isOpen:      boolean;
  viewMode:    ToDoViewMode;
  onToggle:    () => void;
  onSetMode:   (mode: ToDoViewMode) => void;
  onClearChat: () => void;
}

export function ToDoRibbon({ isOpen, viewMode, onToggle, onSetMode, onClearChat }: Props) {
  return (
    <PanelRibbon
      panelId="todo"
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <button
        className={`todo-ribbon__btn${viewMode === 'chat' ? ' todo-ribbon__btn--active' : ''}`}
        onClick={() => onSetMode('chat')}
        title="AI相談"
        aria-label="AI相談"
      >
        <MessageCircle size={16} />
      </button>
      <button
        className={`todo-ribbon__btn${viewMode === 'settings' ? ' todo-ribbon__btn--active' : ''}`}
        onClick={() => onSetMode('settings')}
        title="設定"
        aria-label="設定"
      >
        <Settings size={16} />
      </button>
      <button
        className="todo-ribbon__btn"
        onClick={onClearChat}
        title="会話をクリア"
        aria-label="会話をクリア"
      >
        <Trash2 size={14} />
      </button>
    </PanelRibbon>
  );
}
