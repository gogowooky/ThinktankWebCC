/**
 * HarvestTabBar.tsx
 * HarvestPanel の 縦型タブバー（旧Ribbon）。
 *
 * side="right" でパネルの右端に配置。
 * ボタン: 概要 / 対話 / 設定
 */

import { MessageCircle, Target, Settings } from 'lucide-react';
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
        id="HarvestProject"
        className={`harvest-tab-bar__btn${viewMode === 'project' ? ' harvest-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('project')}
        data-tip="プロジェクト"
        aria-label="HarvestProject"
      >
        <Target size={16} />
      </button>
      <button
        id="HarvestAI"
        className={`harvest-tab-bar__btn${viewMode === 'chat' ? ' harvest-tab-bar__btn--active' : ''}`}
        onClick={() => onSetMode('chat')}
        data-tip="対話"
        aria-label="HarvestAI"
      >
        <MessageCircle size={16} />
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
