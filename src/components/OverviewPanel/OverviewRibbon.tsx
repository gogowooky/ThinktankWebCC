/**
 * OverviewRibbon.tsx
 * OverviewPanel の縦アイコン Ribbon。
 *
 * ボタン構成（上から）:
 *   Sparkles    – AI相談（データ分析チャット）
 *   LayoutList  – Think一覧（選択Thought内のThinkリスト）
 *   BookUser    – Thoughtプロファイル（Markdown表示）
 *   BarChart2   – Thought分析（グラフ）
 * ─────────────────── (spacer) ───────────────────
 *   Settings    – Overview設定（Thoughtプロファイル詳細）下寄せ
 */

import { Sparkles, LayoutList, BarChart2, Settings, type LucideIcon } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import type { MediaType } from '../../types';
import './OverviewRibbon.css';

type OverviewViewMode = 'chat' | 'datagrid' | 'graph';

const VIEW_BUTTONS: Array<{ mode: OverviewViewMode; Icon: LucideIcon; title: string }> = [
  { mode: 'chat',     Icon: Sparkles,   title: 'AI相談（データ分析）' },
  { mode: 'datagrid', Icon: LayoutList, title: 'Think一覧' },
  { mode: 'graph',    Icon: BarChart2,  title: 'Thought分析' },
];

interface Props {
  isOpen:            boolean;
  mediaType:         MediaType;
  showSettings:      boolean;
  onToggle:          () => void;
  onMediaType:       (type: MediaType) => void;
  onToggleSettings?: () => void;
}

export function OverviewRibbon({
  isOpen, mediaType, showSettings, onToggle, onMediaType, onToggleSettings,
}: Props) {
  return (
    <PanelRibbon
      panelId="overview"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {VIEW_BUTTONS.map(({ mode, Icon, title }) => (
        <button
          key={mode}
          className={[
            'overview-ribbon__btn',
            !showSettings && mediaType === mode ? 'overview-ribbon__btn--active' : '',
          ].join(' ')}
          onClick={() => onMediaType(mode as MediaType)}
          title={title}
        >
          <Icon size={14} />
        </button>
      ))}
      <button
        className={`overview-ribbon__btn${showSettings ? ' overview-ribbon__btn--active' : ''}`}
        onClick={onToggleSettings}
        title="Overview設定"
      >
        <Settings size={14} />
      </button>
    </PanelRibbon>
  );
}
