/**
 * HarvestTabBar.tsx
 * HarvestPanel の 縦型タブバー（旧Ribbon）。
 *
 * side="right" でパネルの右端に配置。
 * ボタン: AIView / AIChat / 設定
 */

import { BotMessageSquare, Settings } from 'lucide-react';
import { CpuAi } from '../AiPanels/CpuAi';
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
        id="HarvestAIView"
        className={`harvest-tab-bar__btn${viewMode === 'aiview' ? ' harvest-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('aiview')}
        data-tip="AIView"
        aria-label="HarvestAIView"
      >
        <CpuAi size={16} />
      </button>
      <button
        id="HarvestAIChat"
        className={`harvest-tab-bar__btn${viewMode === 'aichat' ? ' harvest-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('aichat')}
        data-tip="AIChat"
        aria-label="HarvestAIChat"
      >
        <BotMessageSquare size={16} />
      </button>
      <button
        id="HarvestSetting"
        className={`harvest-tab-bar__btn${viewMode === 'settings' ? ' harvest-tab-bar__btn--active' : ''}`}
        disabled
        data-tip="Harvest設定は未実装です。"
        title="Harvest設定は未実装です。"
        aria-label="HarvestSetting"
      >
        <Settings size={16} />
      </button>
    </VerticalTabBar>
  );
}
