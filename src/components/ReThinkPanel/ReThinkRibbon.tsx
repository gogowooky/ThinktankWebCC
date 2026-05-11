/**
 * ReThinkRibbon.tsx
 * Phase 10: ReThinkPanel の Ribbon。
 *
 * side="right" でパネルの右端に配置。
 * ボタン: AI相談 / 設定 / 会話クリア
 */

import { MessageCircle, Settings } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import './ReThinkRibbon.css';

export type { ReThinkViewMode } from '../../views/TTReThinkPanel';

interface Props {
  isOpen:    boolean;
  viewMode:  ReThinkViewMode;
  onToggle:  () => void;
  onSetMode: (mode: ReThinkViewMode) => void;
}

export function ReThinkRibbon({ isOpen, viewMode, onToggle, onSetMode }: Props) {
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

    </PanelRibbon>
  );
}
