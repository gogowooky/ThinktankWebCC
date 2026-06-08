/**
 * ReThinkTabBar.tsx
 * Phase 10: ReThinkPanel の 縦型タブバー（旧Ribbon）。
 *
 * side="right" でパネルの右端に配置。
 * ボタン: AI相談 / 設定 / 会話クリア
 */

import { MessageCircle, Settings } from 'lucide-react';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import './ReThinkTabBar.css';

import type { ReThinkViewMode } from '../../views/TTReThinkPanel';
export type { ReThinkViewMode };

interface Props {
  isOpen:    boolean;
  viewMode:  ReThinkViewMode;
  onToggle:  () => void;
  onSetMode: (mode: ReThinkViewMode) => void;
}

export function ReThinkTabBar({ isOpen, viewMode, onToggle, onSetMode }: Props) {
  return (
    <VerticalTabBar
      panelId="rethink"
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <button
        id="ReThinkAI"
        className={`rethink-tab-bar__btn${viewMode === 'chat' ? ' rethink-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('chat')}
        data-tip="AI相談"
        aria-label="ReThinkAI"
      >
        <MessageCircle size={16} />
      </button>
      <button
        id="ReThinkSetting"
        className={`rethink-tab-bar__btn${viewMode === 'settings' ? ' rethink-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('settings')}
        data-tip="設定"
        aria-label="ReThinkSetting"
      >
        <Settings size={16} />
      </button>
    </VerticalTabBar>
  );
}
