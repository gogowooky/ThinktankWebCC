/**
 * WorkoutTabBar.tsx
 * WorkoutPanel 左縦タブバー（旧リボン）。
 *
 * ボタン構成（上から）:
 *   Workout設定 / TextEditor設定 / Markdown設定 /
 *   DataGrid設定 / Card設定 / Graph設定
 *
 * - 押下で対応する設定パネルを開く
 * - 開いている設定パネルのボタン再押下で閉じる
 * - 下部: フォーカスペインの Think タイトル（縦書き）
 */

import { PanelLeftDashed, NotebookPen, BookOpenText, Table, IdCard, Share2, type LucideIcon } from 'lucide-react';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import type { MediaType } from '../../types';
import './WorkoutTabBar.css';

export type SettingsType = Extract<MediaType, 'workout' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph'>;

interface SettingsEntry {
  type: SettingsType;
  Icon: LucideIcon;
  name: string;
  id: string;
}

export const WORKOUT_SETTINGS: SettingsEntry[] = [
  { type: 'workout',    Icon: PanelLeftDashed, name: 'Workout設定',    id: 'Workout' },
  { type: 'texteditor', Icon: NotebookPen,     name: 'TextEditor設定', id: 'TextEditor' },
  { type: 'markdown',   Icon: BookOpenText,    name: 'Markdown設定',   id: 'Markdown' },
  { type: 'datagrid',   Icon: Table,           name: 'DataGrid設定',   id: 'DataGrid' },
  { type: 'card',       Icon: IdCard,          name: 'Card設定',       id: 'Card' },
  { type: 'graph',      Icon: Share2,          name: 'Graph設定',      id: 'Graph' },
];

interface Props {
  activeSettings:      SettingsType;
  isOpen:              boolean;
  thinkTitle:          string;
  onToggle:            () => void;
  onSetActiveSettings: (type: SettingsType | null) => void;
}

export function WorkoutTabBar({ activeSettings, isOpen, thinkTitle, onToggle, onSetActiveSettings }: Props) {
  const handleClick = (type: SettingsType) => {
    onSetActiveSettings(isOpen && activeSettings === type ? null : type);
  };

  return (
    <VerticalTabBar
      panelId="workout"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={thinkTitle}
    >
      {WORKOUT_SETTINGS.map(({ type, Icon, name, id }) => (
        <button
          key={type}
          id={id}
          className={[
            'workout-tab-bar__btn',
            activeSettings === type ? 'workout-tab-bar__btn--active' : '',
          ].join(' ')}
          onClick={() => handleClick(type)}
          data-tip={name}
          aria-label={id}
        >
          <Icon size={16} />
        </button>
      ))}
    </VerticalTabBar>
  );
}
