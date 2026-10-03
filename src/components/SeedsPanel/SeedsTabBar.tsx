/**
 * SeedsTabBar.tsx
 * SeedsPanel の縦型タブバー（旧Ribbon）。
 *
 * ボタン構成（上から）:
 *   Sparkles    – 会話履歴（データ分析チャット）
 *   LayoutList  – Think一覧（選択Bundle内のThinkリスト）
 *   BookUser    – Bundleプロファイル（Markdown表示）
 *   Microscope  – 分析（この課題の状況）
 * ─────────────────── (spacer) ───────────────────
 *   Settings    – Seeds設定（Bundleプロファイル詳細）下寄せ
 */

import { useCallback, useState } from 'react';
import { MessageCircle, Files, Microscope, Settings, type LucideIcon } from 'lucide-react';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import type { SeedsViewMode } from '../../views/TTSeedsPanel';
import './SeedsTabBar.css';

type SeedsContentMode = Exclude<SeedsViewMode, 'settings'>;

const VIEW_BUTTONS: Array<{ mode: SeedsContentMode; Icon: LucideIcon; title: string; id: string }> = [
  { mode: 'filter',   Icon: Files,         title: 'Think一覧',   id: 'SeedsThinkList' },
  { mode: 'graph',    Icon: Microscope,    title: '分析', id: 'SeedsResearch' },
  { mode: 'chat',     Icon: MessageCircle, title: '会話履歴',      id: 'SeedsAI' },
];

interface Props {
  isOpen:            boolean;
  viewMode:          SeedsViewMode;
  onToggle:          () => void;
  onViewMode:        (mode: SeedsViewMode) => void;
  onToggleSettings?: () => void;
  onRefresh?:        () => void;
  bundleName?:       string;
}

export function SeedsTabBar({
  isOpen, viewMode, onToggle, onViewMode, onToggleSettings, onRefresh, bundleName,
}: Props) {
  return (
    <VerticalTabBar
      panelId="seeds"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={bundleName}
    >
      {VIEW_BUTTONS.map(({ mode, Icon, title, id }) => (
        <button
          key={mode}
          id={id}
          className={[
            'seeds-tab-bar__btn',
            viewMode === mode ? 'seeds-tab-bar__btn--active' : '',
          ].join(' ')}
          onClick={() => onViewMode(mode)}
          data-tip={title}
          aria-label={id}
        >
          <Icon size={16} />
        </button>
      ))}
      <button
        id="SeedsSetting"
        className={`seeds-tab-bar__btn${viewMode === 'settings' ? ' seeds-tab-bar__btn--active' : ''}`}
        onClick={onToggleSettings}
        data-tip="設定"
        aria-label="SeedsSetting"
      >
        <Settings size={16} />
      </button>
    </VerticalTabBar>
  );
}
