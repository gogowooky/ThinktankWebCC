/**
 * Ribbon.tsx
 * 右パネル制御 + DataGrid ボタン。
 * 左パネル切り替えは Phase 9Ex1 以降、LeftToolbar が担当する。
 *
 * Phase 5: 骨格実装
 * Phase 9Ex1: 左パネルボタンを LeftToolbar に移管、右パネル＋DataGrid のみ残す
 * Phase 30 以降: DispatchAction() 経由に切り替え
 */

import React from 'react';
import { List, Link2, Settings, LayoutGrid } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import type { RightPanelType } from '../../types';
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

const RIGHT_ITEMS: { type: RightPanelType; icon: React.ReactNode; label: string }[] = [
  { type: 'outline', icon: <List  size={18} />, label: 'アウトライン' },
  { type: 'related', icon: <Link2 size={18} />, label: '関連' },
];

export function Ribbon() {
  const app = TTApplication.Instance;
  useAppUpdate(app.RightPanel);
  useAppUpdate(app.MainPanel);

  const rp = app.RightPanel;

  return (
    <nav className="ribbon" aria-label="リボン">
      {/* DataGrid ボタン */}
      <div className="ribbon__group">
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
