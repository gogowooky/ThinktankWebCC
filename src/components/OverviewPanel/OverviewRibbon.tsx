/**
 * OverviewRibbon.tsx
 * Phase 9: OverviewPanel の Ribbon。
 *
 * PanelRibbon に MediaType 切り替えボタンを追加する。
 * 対応 MediaType: markdown / datagrid / graph
 */

import { Eye, Table, Share2, type LucideIcon } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import type { MediaType } from '../../types';
import './OverviewRibbon.css';

const MEDIA_BUTTONS: Array<{ type: MediaType; Icon: LucideIcon; title: string }> = [
  { type: 'markdown', Icon: Eye,    title: 'Markdown 表示' },
  { type: 'datagrid', Icon: Table,  title: 'Think 一覧' },
  { type: 'graph',    Icon: Share2, title: '関係グラフ' },
];

interface Props {
  isOpen:      boolean;
  mediaType:   MediaType;
  onToggle:    () => void;
  onMediaType: (type: MediaType) => void;
}

export function OverviewRibbon({ isOpen, mediaType, onToggle, onMediaType }: Props) {
  return (
    <PanelRibbon
      panelId="overview"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {MEDIA_BUTTONS.map(({ type, Icon, title }) => (
        <button
          key={type}
          className={[
            'overview-ribbon__media-btn',
            mediaType === type ? 'overview-ribbon__media-btn--active' : '',
          ].join(' ')}
          onClick={() => onMediaType(type)}
          title={title}
        >
          <Icon size={14} />
        </button>
      ))}
    </PanelRibbon>
  );
}
