/**
 * ToDoRibbon.tsx
 * Phase 10: ToDoPanel の Ribbon。
 *
 * PanelRibbon に「会話クリア」ボタンを追加する。
 * side="right" でパネルの右端に配置。
 */

import { Trash2 } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import './ToDoRibbon.css';

interface Props {
  isOpen:      boolean;
  onToggle:    () => void;
  onClearChat: () => void;
}

export function ToDoRibbon({ isOpen, onToggle, onClearChat }: Props) {
  return (
    <PanelRibbon
      panelId="todo"
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <button
        className="todo-ribbon__btn"
        onClick={onClearChat}
        title="会話をクリア"
      >
        <Trash2 size={14} />
      </button>
    </PanelRibbon>
  );
}
