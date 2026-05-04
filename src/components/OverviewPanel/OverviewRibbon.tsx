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

import { useCallback, useState } from 'react';
import { MessageCircle, Files, Microscope, Settings, type LucideIcon } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import type { MediaType } from '../../types';
import './OverviewRibbon.css';

type OverviewViewMode = 'chat' | 'datagrid' | 'graph';

const VIEW_BUTTONS: Array<{ mode: OverviewViewMode; Icon: LucideIcon; title: string }> = [
  { mode: 'datagrid', Icon: Files,        title: 'Think一覧' },
  { mode: 'graph',    Icon: Microscope,   title: 'Thought分析' },
  { mode: 'chat',     Icon: MessageCircle, title: 'AI相談' },
];

interface Props {
  isOpen:            boolean;
  mediaType:         MediaType;
  showSettings:      boolean;
  onToggle:          () => void;
  onMediaType:       (type: MediaType) => void;
  onToggleSettings?: () => void;
  thoughtName?:      string;
  onThoughtDrop?:    (id: string) => void;
}

export function OverviewRibbon({
  isOpen, mediaType, showSettings, onToggle, onMediaType, onToggleSettings, thoughtName,
  onThoughtDrop,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-thought-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const id = e.dataTransfer.getData('application/x-thought-id');
    if (id) onThoughtDrop?.(id);
  }, [onThoughtDrop]);

  return (
    <PanelRibbon
      panelId="overview"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={thoughtName}
      isDragOver={isDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {VIEW_BUTTONS.map(({ mode, Icon, title }) => (
        <button
          key={mode}
          className={[
            'overview-ribbon__btn',
            !showSettings && mediaType === mode ? 'overview-ribbon__btn--active' : '',
          ].join(' ')}
          onClick={() => onMediaType(mode as MediaType)}
          data-tip={title}
          aria-label={title}
        >
          <Icon size={16} />
        </button>
      ))}
      <button
        className={`overview-ribbon__btn${showSettings ? ' overview-ribbon__btn--active' : ''}`}
        onClick={onToggleSettings}
        data-tip="設定"
        aria-label="設定"
      >
        <Settings size={16} />
      </button>
    </PanelRibbon>
  );
}
