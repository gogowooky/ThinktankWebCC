/**
 * WorkoutRibbon.tsx
 * WorkoutPanel 左縦リボン（カスタム実装）。
 *
 * ボタン構成（上から）:
 *   Workout設定 / TextEditor設定 / Markdown設定 /
 *   DataGrid設定 / Card設定 / Graph設定
 *
 * - 押下で対応する設定パネルを開く
 * - 開いている設定パネルのボタン再押下で閉じる
 * - 上部: アクティブ設定名ラベル（縦書き）
 * - 下部: フォーカスペインの Think タイトル（縦書き）
 */

import { Layers, FileText, Eye, Table, LayoutGrid, Share2, type LucideIcon } from 'lucide-react';
import type { MediaType } from '../../types';
import './WorkoutRibbon.css';

export type SettingsType = Extract<MediaType, 'workout' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph'>;

interface SettingsEntry {
  type: SettingsType;
  Icon: LucideIcon;
  name: string;
}

export const WORKOUT_SETTINGS: SettingsEntry[] = [
  { type: 'workout',    Icon: Layers,      name: 'Workout設定' },
  { type: 'texteditor', Icon: FileText,    name: 'TextEditor設定' },
  { type: 'markdown',   Icon: Eye,         name: 'Markdown設定' },
  { type: 'datagrid',   Icon: Table,       name: 'DataGrid設定' },
  { type: 'card',       Icon: LayoutGrid,  name: 'Card設定' },
  { type: 'graph',      Icon: Share2,      name: 'Graph設定' },
];

interface Props {
  activeSettings:    SettingsType | null;
  thinkTitle:        string;
  onSetActiveSettings: (type: SettingsType | null) => void;
}

export function WorkoutRibbon({ activeSettings, thinkTitle, onSetActiveSettings }: Props) {
  const activeName = activeSettings
    ? WORKOUT_SETTINGS.find(s => s.type === activeSettings)?.name ?? ''
    : '';

  const handleClick = (type: SettingsType) => {
    onSetActiveSettings(activeSettings === type ? null : type);
  };

  return (
    <div className="workout-ribbon">

      {/* 上部: アクティブ設定名（縦書き）*/}
      <div className="workout-ribbon__top-wrap" title={activeName}>
        <span className="workout-ribbon__top-label">{activeName}</span>
      </div>

      {/* 設定ボタン群 */}
      <div className="workout-ribbon__buttons">
        {WORKOUT_SETTINGS.map(({ type, Icon, name }) => (
          <button
            key={type}
            className={[
              'workout-ribbon__btn',
              activeSettings === type ? 'workout-ribbon__btn--active' : '',
            ].join(' ')}
            onClick={() => handleClick(type)}
            title={name}
            aria-label={name}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* スペーサー */}
      <div className="workout-ribbon__spacer" />

      {/* 下部: Think タイトル（縦書き）*/}
      {thinkTitle && (
        <div className="workout-ribbon__label-wrap" title={thinkTitle}>
          <span className="workout-ribbon__label">{thinkTitle}</span>
        </div>
      )}
    </div>
  );
}
