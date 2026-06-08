/**
 * OverviewRibbon.tsx
 * OverviewPanel の縦型タブバー（旧Ribbon）。
 *
 * ボタン構成（上から）:
 *   Sparkles    – AI相談（データ分析チャット）
 *   LayoutList  – Think一覧（選択Thought内のThinkリスト）
 *   BookUser    – Thoughtプロファイル（Markdown表示）
 *   BarChart2   – Thought分析（グラフ）
 * ─────────────────── (spacer) ───────────────────
 *   Settings    – Overview設定（Thoughtプロファイル詳細）下寄せ
 */

import { useCallback, useState } from 'react';
import { MessageCircle, Files, Microscope, Settings, type LucideIcon } from 'lucide-react';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import type { OverviewViewMode } from '../../views/TTOverviewPanel';
import './OverviewRibbon.css';

type OverviewContentMode = Exclude<OverviewViewMode, 'settings'>;

const VIEW_BUTTONS: Array<{ mode: OverviewContentMode; Icon: LucideIcon; title: string; id: string }> = [
  { mode: 'datagrid', Icon: Files,         title: 'Think一覧',   id: 'OverviewThinkList' },
  { mode: 'graph',    Icon: Microscope,    title: 'Thought分析', id: 'OverviewResearch' },
  { mode: 'chat',     Icon: MessageCircle, title: 'AI相談',      id: 'OverviewAI' },
];

interface Props {
  isOpen:            boolean;
  viewMode:          OverviewViewMode;
  onToggle:          () => void;
  onViewMode:        (mode: OverviewViewMode) => void;
  onToggleSettings?: () => void;
  onRefresh?:        () => void;
  thoughtName?:      string;
}

export function OverviewRibbon({
  isOpen, viewMode, onToggle, onViewMode, onToggleSettings, onRefresh, thoughtName,
}: Props) {
  return (
    <VerticalTabBar
      panelId="overview"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={thoughtName}
    >
      {VIEW_BUTTONS.map(({ mode, Icon, title, id }) => (
        <button
          key={mode}
          id={id}
          className={[
            'overview-ribbon__btn',
            viewMode === mode ? 'overview-ribbon__btn--active' : '',
          ].join(' ')}
          onClick={() => onViewMode(mode)}
          data-tip={title}
          aria-label={id}
        >
          <Icon size={16} />
        </button>
      ))}
      <button
        id="OverviewSetting"
        className={`overview-ribbon__btn${viewMode === 'settings' ? ' overview-ribbon__btn--active' : ''}`}
        onClick={onToggleSettings}
        data-tip="設定"
        aria-label="OverviewSetting"
      >
        <Settings size={16} />
      </button>
    </VerticalTabBar>
  );
}
