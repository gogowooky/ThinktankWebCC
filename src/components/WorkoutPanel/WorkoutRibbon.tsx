/**
 * WorkoutRibbon.tsx
 * WorkoutPanel 左縦リボン。
 *
 * ボタン構成（上から）:
 *   toggle        – WorkoutSettingPanel 開閉
 *   Workout       – Workout スタイル（workout）
 *   TextEditor    – テキストエディタ（texteditor）
 *   Markdown      – Markdown（markdown）
 *   Grid          – グリッド（datagrid）
 *   Card          – カード（card）
 *   Graph         – グラフ（graph）
 * ─────────────── (spacer) ───────────────
 *   "Workout" ラベル（縦書き、下寄せ）
 */

import { Layers, FileText, Eye, Table, LayoutGrid, Share2, type LucideIcon } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import type { TTWorkoutPanel } from '../../views/TTWorkoutPanel';
import type { MediaType } from '../../types';
import './WorkoutRibbon.css';

type StyleEntry = { type: MediaType; Icon: LucideIcon; title: string };

const STYLE_BUTTONS: StyleEntry[] = [
  { type: 'workout',    Icon: Layers,      title: 'Workout スタイル' },
  { type: 'texteditor', Icon: FileText,    title: 'テキストエディタ' },
  { type: 'markdown',   Icon: Eye,         title: 'Markdown' },
  { type: 'datagrid',   Icon: Table,       title: 'グリッド' },
  { type: 'card',       Icon: LayoutGrid,  title: 'カード' },
  { type: 'graph',      Icon: Share2,      title: 'グラフ' },
];

interface Props {
  panel:            TTWorkoutPanel;
  showSettings:     boolean;
  onToggleSettings: () => void;
  onSetMediaType:   (type: MediaType) => void;
}

export function WorkoutRibbon({ panel, showSettings, onToggleSettings, onSetMediaType }: Props) {
  const focusedArea = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
  const focusedType = focusedArea?.MediaType ?? null;

  return (
    <PanelRibbon
      panelId="workout"
      side="left"
      isOpen={showSettings}
      onToggle={onToggleSettings}
      bottomLabel="Workout"
    >
      {STYLE_BUTTONS.map(({ type, Icon, title }) => (
        <button
          key={type}
          className={[
            'workout-ribbon__btn',
            focusedType === type ? 'workout-ribbon__btn--active' : '',
          ].join(' ')}
          onClick={() => onSetMediaType(type)}
          title={title}
          aria-label={title}
        >
          <Icon size={16} />
        </button>
      ))}
    </PanelRibbon>
  );
}
