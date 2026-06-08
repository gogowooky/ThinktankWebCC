/**
 * ThinktankTabBar.tsx
 * ThinktankPanel の縦タブバー（旧Ribbon）ボタン群。
 *
 * 上部: Think一覧（検索・Thought一覧を統合）/ AI相談
 * 下部: 設定
 */

import {
  MessageCircle, Files, Settings, RefreshCw,
} from 'lucide-react';
import { VerticalTabBar } from '../Layout/VerticalTabBar';
import type { ThinktankViewMode } from '../../views/TTThinktankPanel';
import './ThinktankTabBar.css';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  viewMode: ThinktankViewMode;
  onSetViewMode: (mode: ThinktankViewMode) => void;
  onRefresh: () => void;
  onSync?: () => void;
  vaultName?: string;
}

// ── メインボタン定義 ────────────────────────────────────────────────────

const MODE_BUTTONS: {
  mode: ThinktankViewMode;
  icon: React.ReactNode;
  label: string;
  id: string;
}[] = [
  { mode: 'filter',  icon: <Files       size={16} />, label: 'Think一覧', id: 'ThinktankThinkList' },
  { mode: 'chat',    icon: <MessageCircle size={16} />, label: 'AI相談', id: 'ThinktankAI' },
];

// ── コンポーネント ──────────────────────────────────────────────────────

export function ThinktankTabBar({
  isOpen,
  onToggle,
  viewMode,
  onSetViewMode,
  onRefresh,
  onSync,
  vaultName,
}: Props) {
  return (
    <VerticalTabBar
      panelId="thinktank"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={vaultName}
    >
      {MODE_BUTTONS.map(({ mode: m, icon, label, id }) => (
        <button
          key={m}
          id={id}
          className={`tab-icon-btn${viewMode === m ? ' tab-icon-btn--active' : ''}`}
          data-tip={label}
          aria-label={id}
          onClick={() => onSetViewMode(m)}
        >
          {icon}
        </button>
      ))}
      {onSync && (
        <button
          className="tab-icon-btn"
          data-tip="BigQuery同期"
          aria-label="BigQuery同期"
          onClick={onSync}
        >
          <RefreshCw size={16} />
        </button>
      )}
      <button
        id="ThinktankSetting"
        className={`tab-icon-btn${viewMode === 'settings' ? ' tab-icon-btn--active' : ''}`}
        data-tip="設定"
        aria-label="ThinktankSetting"
        onClick={() => onSetViewMode('settings')}
      >
        <Settings size={16} />
      </button>
    </VerticalTabBar>
  );
}
