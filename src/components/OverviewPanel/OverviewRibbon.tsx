/**
 * OverviewRibbon.tsx
 * OverviewPanel の縦アイコン Ribbon。
 *
 * ボタン構成（上から）:
 *   Sparkles    – AI相談（データ分析チャット）
 *   LayoutList  – Thought一覧
 *   BookUser    – Thoughtプロファイル
 *   BarChart2   – Thought分析
 * ─────────────────── (spacer) ───────────────────
 *   Settings    – Overview設定（下寄せ）
 */

import { Sparkles, LayoutList, BookUser, BarChart2, Settings, type LucideIcon } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import type { MediaType } from '../../types';
import './OverviewRibbon.css';

type OverviewViewMode = 'chat' | 'datagrid' | 'markdown' | 'graph';

const VIEW_BUTTONS: Array<{ mode: OverviewViewMode; Icon: LucideIcon; title: string }> = [
  { mode: 'chat',      Icon: Sparkles,    title: 'AI相談（データ分析）' },
  { mode: 'datagrid',  Icon: LayoutList,  title: 'Think一覧' },
  { mode: 'markdown',  Icon: BookUser,    title: 'Thoughtプロファイル' },
  { mode: 'graph',     Icon: BarChart2,   title: 'Thought分析' },
];

interface Props {
  isOpen:           boolean;
  mediaType:        MediaType;
  onToggle:         () => void;
  onMediaType:      (type: MediaType) => void;
  onToggleSettings?: () => void;
}

export function OverviewRibbon({ isOpen, mediaType, onToggle, onMediaType, onToggleSettings }: Props) {
  return (
    <PanelRibbon
      panelId="overview"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomChildren={
        <button
          className="overview-ribbon__btn"
          onClick={onToggleSettings}
          title="Overview設定"
        >
          <Settings size={14} />
        </button>
      }
    >
      {VIEW_BUTTONS.map(({ mode, Icon, title }) => (
        <button
          key={mode}
          className={[
            'overview-ribbon__btn',
            mediaType === mode ? 'overview-ribbon__btn--active' : '',
          ].join(' ')}
          onClick={() => onMediaType(mode as MediaType)}
          title={title}
        >
          <Icon size={14} />
        </button>
      ))}
    </PanelRibbon>
  );
}
