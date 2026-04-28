/**
 * ThinktankRibbon.tsx
 * ThinktankPanel の Ribbon ボタン群。
 *
 * 上部: AI / Filter / Search / Thoughts の4モードボタン
 * 下部: 同期インジケーター / 起動モード / 設定
 */

import {
  Sparkles, Filter, Search, Brain,
  Monitor, Globe, Settings,
  CheckCircle, RefreshCw, AlertCircle, WifiOff, Clock,
} from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import { StorageManager } from '../../services/storage/StorageManager';
import type { ThinktankViewMode } from '../../views/TTThinktankPanel';
import type { SyncState } from '../../types';
import './ThinktankRibbon.css';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  viewMode: ThinktankViewMode;
  onSetViewMode: (mode: ThinktankViewMode) => void;
  syncState?: SyncState;
}

// ── 同期インジケーター ──────────────────────────────────────────────────

function SyncIcon({ state }: { state: SyncState }) {
  switch (state) {
    case 'synced':  return <CheckCircle size={15} />;
    case 'syncing': return <RefreshCw   size={15} className="spin" />;
    case 'pending': return <Clock       size={15} />;
    case 'error':   return <AlertCircle size={15} />;
    case 'offline': return <WifiOff     size={15} />;
  }
}

const SYNC_LABEL: Record<SyncState, string> = {
  synced:  '同期済み',
  syncing: '同期中…',
  pending: '同期待ち',
  error:   '同期エラー',
  offline: 'オフライン',
};

// ── メインボタン定義 ────────────────────────────────────────────────────

const MODE_BUTTONS: {
  mode: ThinktankViewMode;
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: 'ai',      icon: <Sparkles size={16} />,          label: 'AI相談' },
  { mode: 'filter',  icon: <Filter   size={16} />,          label: 'フィルター（タイトル・日時）' },
  { mode: 'search',  icon: <Search   size={16} />,          label: '全文検索（内容）' },
  { mode: 'thoughts',icon: <Brain    size={16} />,          label: 'Thought一覧' },
];

// ── コンポーネント ──────────────────────────────────────────────────────

export function ThinktankRibbon({
  isOpen,
  onToggle,
  viewMode,
  onSetViewMode,
  syncState = 'synced',
}: Props) {
  const mode = StorageManager.instance.mode;

  return (
    <PanelRibbon
      panelId="thinktank"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomChildren={
        <>
          <button
            className={`ribbon-icon-btn ribbon-icon-btn--sync ribbon-icon-btn--${syncState}`}
            title={SYNC_LABEL[syncState]}
            aria-label={SYNC_LABEL[syncState]}
          >
            <SyncIcon state={syncState} />
          </button>
          <button
            className="ribbon-icon-btn ribbon-icon-btn--mode"
            title={mode === 'local' ? 'Localモード' : 'PWAモード'}
            aria-label={mode === 'local' ? 'Localモード' : 'PWAモード'}
          >
            {mode === 'local' ? <Monitor size={15} /> : <Globe size={15} />}
          </button>
        </>
      }
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
