/**
 * ReThinkRibbon.tsx
 * Phase 10: ReThinkPanel の Ribbon。
 *
 * side="right" でパネルの右端に配置。
 * ボタン: AI相談 / 設定 / 会話クリア
 */

import { Trash2, MessageCircle, Settings } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import './ReThinkRibbon.css';

export type ReThinkViewMode = 'chat' | 'settings';

interface Props {
  isOpen:      boolean;
  viewMode:    ReThinkViewMode;
  onToggle:    () => void;
  onSetMode:   (mode: ReThinkViewMode) => void;
  onClearChat: () => void;
}

export function ReThinkRibbon({ isOpen, viewMode, onToggle, onSetMode, onClearChat }: Props) {
  return (
    <PanelRibbon
      panelId="rethink"
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <button
        className={`rethink-ribbon__btn${viewMode === 'chat' ? ' rethink-ribbon__btn--active' : ''}`}
        onClick={() => onSetMode('chat')}
        data-tip="AI相談"
        aria-label="AI相談"
      >
        <MessageCircle size={16} />
      </button>
      <button
        className={`rethink-ribbon__btn${viewMode === 'settings' ? ' rethink-ribbon__btn--active' : ''}`}
        onClick={() => onSetMode('settings')}
        data-tip="設定"
        aria-label="設定"
      >
        <Settings size={16} />
      </button>
      <button
        className="rethink-ribbon__btn"
        onClick={onClearChat}
        data-tip="会話をクリア"
        aria-label="会話をクリア"
      >
        <Trash2 size={14} />
      </button>
    </PanelRibbon>
  );
}
