/**
 * Ribbon.tsx
 * 左端の縦アイコンリボン。
 * - 上部グループ: 左パネル種別の切り替え（ナビ・検索・タグ・最近）
 * - 下部グループ: 右パネル種別の切り替え（アウトライン・関連）＋ 設定
 *
 * Phase 5: 骨格実装
 * Phase 30 以降: DispatchAction() 経由に切り替え
 */

import React from 'react';
import {
  BookOpen, Search, Tag, Clock,
  List, Link2, Settings, LayoutGrid,
} from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { LeftPanelType, RightPanelType } from '../../types';
import './Ribbon.css';

interface IconBtnProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function IconBtn({ icon, label, active, onClick }: IconBtnProps) {
  return (
    <button
      className={`ribbon__btn${active ? ' ribbon__btn--active' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}

const LEFT_ITEMS: { type: LeftPanelType; icon: React.ReactNode; label: string }[] = [
  { type: 'navigator', icon: <BookOpen size={18} />, label: 'ナビゲーター' },
  { type: 'search',    icon: <Search    size={18} />, label: '検索' },
  { type: 'tags',      icon: <Tag       size={18} />, label: 'タグ' },
  { type: 'recent',   icon: <Clock     size={18} />, label: '最近' },
];

const RIGHT_ITEMS: { type: RightPanelType; icon: React.ReactNode; label: string }[] = [
  { type: 'outline',    icon: <List  size={18} />, label: 'アウトライン' },
  { type: 'related',    icon: <Link2 size={18} />, label: '関連' },
];

export function Ribbon() {
  const app = TTApplication.Instance;
  useAppUpdate(app.LeftPanel);
  useAppUpdate(app.RightPanel);
  useAppUpdate(app.MainPanel);

  const lp = app.LeftPanel;
  const rp = app.RightPanel;

  return (
    <nav className="ribbon" aria-label="リボン">
      {/* 上部グループ: 左パネル切り替え */}
      <div className="ribbon__group">
        {LEFT_ITEMS.map(({ type, icon, label }) => (
          <IconBtn
            key={type}
            icon={icon}
            label={label}
            active={lp.PanelType === type && lp.IsOpen}
            onClick={() => lp.SwitchTo(type)}
          />
        ))}
      </div>

      {/* DataGrid ボタン（特殊タブを開く） */}
      <div className="ribbon__group ribbon__group--datagrid">
        <IconBtn
          icon={<LayoutGrid size={18} />}
          label="データグリッド"
          active={app.MainPanel.ActiveTab?.ViewType === 'datagrid'}
          onClick={() => app.OpenDataGrid()}
        />
      </div>

      {/* 下部グループ: 右パネル切り替え＋設定 */}
      <div className="ribbon__bottom">
        {RIGHT_ITEMS.map(({ type, icon, label }) => (
          <IconBtn
            key={type}
            icon={icon}
            label={label}
            active={rp.PanelType === type && rp.IsOpen}
            onClick={() => rp.SwitchTo(type)}
          />
        ))}
        <div className="ribbon__divider" />
        <IconBtn
          icon={<Settings size={18} />}
          label="設定"
          onClick={() => { /* Phase 30 以降 */ }}
        />
      </div>
    </nav>
  );
}
