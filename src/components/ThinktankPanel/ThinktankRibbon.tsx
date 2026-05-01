/**
 * ThinktankRibbon.tsx
 * ThinktankPanel の Ribbon ボタン群。
 *
 * 上部: AI / Filter / Search / Thoughts の4モードボタン
 * 下部: 設定
 */

import {
  Ghost, Files, SearchCheck, Library, Settings,
} from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import type { ThinktankViewMode } from '../../views/TTThinktankPanel';
import './ThinktankRibbon.css';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  viewMode: ThinktankViewMode;
  onSetViewMode: (mode: ThinktankViewMode) => void;
  vaultName?: string;
}

// ── メインボタン定義 ────────────────────────────────────────────────────

const MODE_BUTTONS: {
  mode: ThinktankViewMode;
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: 'filter',  icon: <Files      size={16} />,         label: 'Think一覧' },
  { mode: 'search',  icon: <SearchCheck size={16} />,          label: '全文検索（内容）' },
  { mode: 'thoughts',icon: <Library     size={16} />,          label: 'Thought一覧' },
  { mode: 'ai',      icon: <Ghost         size={16} />,          label: 'AI相談' },
];

// ── コンポーネント ──────────────────────────────────────────────────────

export function ThinktankRibbon({
  isOpen,
  onToggle,
  viewMode,
  onSetViewMode,
  vaultName,
}: Props) {
  return (
    <PanelRibbon
      panelId="thinktank"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomLabel={vaultName}
    >
      {MODE_BUTTONS.map(({ mode: m, icon, label }) => (
        <button
          key={m}
          className={`ribbon-icon-btn${viewMode === m ? ' ribbon-icon-btn--active' : ''}`}
          title={label}
          aria-label={label}
          onClick={() => onSetViewMode(m)}
        >
          {icon}
        </button>
      ))}
      <button
        className={`ribbon-icon-btn${viewMode === 'settings' ? ' ribbon-icon-btn--active' : ''}`}
        title="設定"
        aria-label="設定"
        onClick={() => onSetViewMode('settings')}
      >
        <Settings size={15} />
      </button>
    </PanelRibbon>
  );
}
