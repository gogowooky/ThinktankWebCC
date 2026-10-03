/**
 * DevelopTabBar.tsx
 * DevelopPanel 左縦タブバー（旧リボン）。
 *
 * ボタン構成（上から）:
 *   Pane設定 / 会話履歴 / ─区切り線─ / TextEditor設定 / Markdown設定 /
 *   DataGrid設定 / Card設定 / Graph設定 / Html設定
 *
 * - 押下で対応する設定パネルを開く
 * - 開いている設定パネルのボタン再押下で閉じる
 * - 下部: フォーカスペインの Think タイトル（縦書き）
 */

import { Fragment } from 'react';
import { PanelLeftDashed, NotebookPen, BookOpenText, Table, IdCard, Share2, FileCode, MessageCircle, type LucideIcon } from 'lucide-react';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import type { MediaType } from '../../types';
import './DevelopTabBar.css';

export type SettingsType = Extract<MediaType, 'panes' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph' | 'html' | 'chat'>;

interface SettingsEntry {
  type: SettingsType;
  Icon: LucideIcon;
  name: string;
  id: string;
}

export const DEVELOP_SETTINGS: SettingsEntry[] = [
  { type: 'panes',      Icon: PanelLeftDashed, name: 'Pane設定',       id: 'Panes' },
  { type: 'chat',       Icon: MessageCircle,   name: '会話履歴',         id: 'AiChat' },
  { type: 'texteditor', Icon: NotebookPen,     name: 'TextEditor設定', id: 'TextEditor' },
  { type: 'markdown',   Icon: BookOpenText,    name: 'Markdown設定',   id: 'Markdown' },
  { type: 'datagrid',   Icon: Table,           name: 'DataGrid設定',   id: 'DataGrid' },
  { type: 'card',       Icon: IdCard,          name: 'Card設定',       id: 'Card' },
  { type: 'graph',      Icon: Share2,          name: 'Graph設定',      id: 'Graph' },
  { type: 'html',       Icon: FileCode,        name: 'Html設定',       id: 'Html' },
];

interface Props {
  activeSettings:      SettingsType;
  isOpen:              boolean;
  thinkTitle:          string;
  onToggle:            () => void;
  onSetActiveSettings: (type: SettingsType | null) => void;
  isEditMode?:         boolean;
}

export function DevelopTabBar({ activeSettings, isOpen, thinkTitle, onToggle, onSetActiveSettings, isEditMode = false }: Props) {
  const visibleSettings = isEditMode ? DEVELOP_SETTINGS.filter(s => s.type !== 'chat') : DEVELOP_SETTINGS;

  const handleClick = (type: SettingsType) => {
    onSetActiveSettings(isOpen && activeSettings === type ? null : type);
  };

  return (
    <VerticalTabBar
      panelId="develop"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={thinkTitle}
    >
      {visibleSettings.map(({ type, Icon, name, id }) => (
        <Fragment key={type}>
          {type === 'texteditor' && <div className="develop-tab-bar__divider" />}
          <button
            id={id}
            className={[
              'develop-tab-bar__btn',
              activeSettings === type ? 'develop-tab-bar__btn--active' : '',
            ].join(' ')}
            onClick={() => handleClick(type)}
            data-tip={name}
            aria-label={id}
          >
            <Icon size={16} />
          </button>
        </Fragment>
      ))}
    </VerticalTabBar>
  );
}
