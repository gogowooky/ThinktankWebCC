/**
 * LeftToolbar.tsx
 * 左端アイコンバー。5つのボタンで左パネルの表示種別を切り替える。
 *
 * Phase 9Ex1: 初期実装
 */

import React from 'react';
import { Settings, FileText, History, Filter, Search } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { LeftPanelType } from '../../types';
import './LeftToolbar.css';

interface ToolbarButton {
  type: LeftPanelType;
  icon: React.ReactNode;
  label: string;
}

const BUTTONS: ToolbarButton[] = [
  { type: 'pickup-settings', icon: <Settings size={18} />,  label: 'pickup設定' },
  { type: 'media-settings',  icon: <FileText size={18} />,  label: 'メディア設定' },
  { type: 'history',         icon: <History size={18} />,   label: '履歴' },
  { type: 'filter',          icon: <Filter size={18} />,    label: 'フィルター' },
  { type: 'fulltext-search', icon: <Search size={18} />,    label: '全文検索' },
];

export function LeftToolbar() {
  const app = TTApplication.Instance;
  useAppUpdate(app.LeftPanel);
  const lp = app.LeftPanel;

  return (
    <div className="left-toolbar" role="toolbar" aria-label="左ツールバー">
      {BUTTONS.map(({ type, icon, label }) => {
        const isActive = lp.IsOpen && lp.PanelType === type;
        return (
          <button
            key={type}
            className={`left-toolbar__btn${isActive ? ' left-toolbar__btn--active' : ''}`}
            onClick={() => lp.SwitchTo(type)}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}
