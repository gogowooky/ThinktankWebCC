/**
 * HarvestTabBar.tsx
 * Phase 10: HarvestPanel の 縦型タブバー（旧Ribbon）。
 *
 * side="right" でパネルの右端に配置。
 * ボタン: 会話履歴 / 設定 / 会話クリア
 */

import { MessageCircle, Settings } from 'lucide-react';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import './HarvestTabBar.css';

import type { HarvestViewMode } from '../../views/TTHarvestPanel';
export type { HarvestViewMode };

interface Props {
  isOpen:    boolean;
  viewMode:  HarvestViewMode;
  onToggle:  () => void;
  onSetMode: (mode: HarvestViewMode) => void;
}

export function HarvestTabBar({ isOpen, viewMode, onToggle, onSetMode }: Props) {
  return (
    <VerticalTabBar
      panelId="harvest"
      side="right"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <button
        id="HarvestAI"
        className={`harvest-tab-bar__btn${viewMode === 'chat' ? ' harvest-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('chat')}
        data-tip="会話履歴"
        aria-label="HarvestAI"
      >
        <MessageCircle size={16} />
      </button>
      <button
        id="HarvestSetting"
        className={`harvest-tab-bar__btn${viewMode === 'settings' ? ' harvest-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('settings')}
        data-tip="設定"
        aria-label="HarvestSetting"
      >
        <Settings size={16} />
      </button>
    </VerticalTabBar>
  );
}
