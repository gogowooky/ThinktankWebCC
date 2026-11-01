/**
 * WorkingTabBar.tsx
 * WorkingPanel 左縦タブバー（旧リボン）。
 *
 * ボタン構成（上から）:
 *   Pane設定 / AIView / AIChat / ─区切り線─ / TextEditor設定 / Chat設定 / Markdown設定 /
 *   DataGrid設定 / Card設定 / Graph設定 / Html設定
 *
 * - 押下で対応する設定パネルを開く
 * - 開いている設定パネルのボタン再押下で閉じる
 * - 下部: フォーカスペインの Think タイトル（縦書き）
 */

import { Fragment } from 'react';
import { PanelsTopLeft, NotebookPen, BookOpenText, Table, IdCard, Share2, FileCode, BotMessageSquare, MessageCircle, type LucideIcon } from 'lucide-react';
import { CpuAi } from '../AiPanels/CpuAi';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import type { MediaType } from '../../types';
import './WorkingTabBar.css';

/** chatsetting は Chat設定（'chat' は旧「対話」で aichat に読み替える値なので使わない） */
export type SettingsType = Extract<MediaType, 'panes' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph' | 'html'> | 'aiview' | 'aichat' | 'chatsetting';

interface SettingsEntry {
  type: SettingsType;
  Icon: LucideIcon;
  name: string;
  id: string;
  unavailableReason?: string;
}

export const DEVELOP_SETTINGS: SettingsEntry[] = [
  { type: 'panes',      Icon: PanelsTopLeft,   name: 'Pane設定',       id: 'Panes' },
  { type: 'aiview',     Icon: CpuAi,              name: 'AIView',         id: 'WorkingAIView' },
  { type: 'aichat',     Icon: BotMessageSquare, name: 'AIChat',        id: 'WorkingAIChat' },
  { type: 'texteditor', Icon: NotebookPen,     name: 'TextEditor設定', id: 'TextEditor' },
  { type: 'chatsetting', Icon: MessageCircle,  name: 'Chat設定',       id: 'ChatSetting' },
  { type: 'markdown',   Icon: BookOpenText,    name: 'Markdown設定',   id: 'Markdown', unavailableReason: 'Markdown設定は未実装です。' },
  { type: 'datagrid',   Icon: Table,           name: 'DataGrid設定',   id: 'DataGrid' },
  { type: 'card',       Icon: IdCard,          name: 'Card設定',       id: 'Card', unavailableReason: 'Card設定は未実装です。' },
  { type: 'graph',      Icon: Share2,          name: 'Graph設定',      id: 'Graph', unavailableReason: 'Graph設定は未実装です。' },
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

export function WorkingTabBar({ activeSettings, isOpen, thinkTitle, onToggle, onSetActiveSettings }: Props) {
  const handleClick = (type: SettingsType) => {
    onSetActiveSettings(isOpen && activeSettings === type ? null : type);
  };

  return (
    <VerticalTabBar
      panelId="working"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={thinkTitle}
    >
      {DEVELOP_SETTINGS.map(({ type, Icon, name, id, unavailableReason }) => (
        <Fragment key={type}>
          {type === 'texteditor' && <div className="working-tab-bar__divider" />}
          <button
            id={id}
            className={[
              'working-tab-bar__btn',
              activeSettings === type ? 'working-tab-bar__btn--active' : '',
            ].join(' ')}
            disabled={unavailableReason !== undefined}
            onClick={unavailableReason ? undefined : () => handleClick(type)}
            data-tip={unavailableReason ?? name}
            title={unavailableReason}
            aria-label={id}
          >
            <Icon size={16} />
          </button>
        </Fragment>
      ))}
    </VerticalTabBar>
  );
}
