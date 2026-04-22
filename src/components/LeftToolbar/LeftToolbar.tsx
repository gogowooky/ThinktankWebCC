/**
 * LeftToolbar.tsx
 * 左端アイコンバー。5つのボタンで左パネルの表示種別を切り替える。
 *
 * Phase 9Ex1: 初期実装
 */

import React, { useState, useEffect } from 'react';
import { Settings, FileText, History, Filter, Search } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
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
  const lp = app.LeftPanel;

  const [panelOpen, setPanelOpen] = useState(lp.IsOpen);
  const [panelType, setPanelType] = useState(lp.PanelType);

  useEffect(() => {
    const key = `left-toolbar-${Math.random().toString(36).slice(2)}`;
    lp.AddOnUpdate(key, () => {
      setPanelOpen(lp.IsOpen);
      setPanelType(lp.PanelType);
    });
    return () => lp.RemoveOnUpdate(key);
  }, [lp]);

  if (!panelOpen) return null;

  return (
    <div className="left-toolbar" role="toolbar" aria-label="左ツールバー">
      {BUTTONS.map(({ type, icon, label }) => {
        const isActive = panelOpen && panelType === type;
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
