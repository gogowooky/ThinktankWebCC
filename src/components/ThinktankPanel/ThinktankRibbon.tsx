/**
 * ThinktankRibbon.tsx
 * Phase 6: ThinktankPanel の Ribbon ボタン群。
 * 下部に同期インジケーター・起動モード・設定アイコンを表示する。
 */

import { Monitor, Globe, Settings, CheckCircle, RefreshCw, AlertCircle, WifiOff, Clock } from 'lucide-react';
import { PanelRibbon } from '../Layout/PanelRibbon';
import { StorageManager } from '../../services/storage/StorageManager';
import type { SyncState } from '../../types';
import './ThinktankRibbon.css';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  syncState?: SyncState;
}

function SyncIcon({ state }: { state: SyncState }) {
  switch (state) {
    case 'synced':   return <CheckCircle  size={15} />;
    case 'syncing':  return <RefreshCw    size={15} className="spin" />;
    case 'pending':  return <Clock        size={15} />;
    case 'error':    return <AlertCircle  size={15} />;
    case 'offline':  return <WifiOff      size={15} />;
  }
}

const SYNC_LABEL: Record<SyncState, string> = {
  synced:  '同期済み',
  syncing: '同期中…',
  pending: '同期待ち',
  error:   '同期エラー',
  offline: 'オフライン',
};

export function ThinktankRibbon({ isOpen, onToggle, syncState = 'synced' }: Props) {
  const mode = StorageManager.instance.mode;

  return (
    <PanelRibbon
      panelId="thinktank"
      side="left"
      isOpen={isOpen}
      onToggle={onToggle}
      bottomChildren={
        <>
          {/* 同期インジケーター */}
          <button
            className={`ribbon-icon-btn ribbon-icon-btn--sync ribbon-icon-btn--${syncState}`}
            title={SYNC_LABEL[syncState]}
            aria-label={SYNC_LABEL[syncState]}
          >
            <SyncIcon state={syncState} />
          </button>

          {/* 起動モード */}
          <button
            className="ribbon-icon-btn ribbon-icon-btn--mode"
            title={mode === 'local' ? 'Localモード' : 'PWAモード'}
            aria-label={mode === 'local' ? 'Localモード' : 'PWAモード'}
          >
            {mode === 'local' ? <Monitor size={15} /> : <Globe size={15} />}
          </button>

          {/* 設定 */}
          <button
            className="ribbon-icon-btn"
            title="設定"
            aria-label="設定"
          >
            <Settings size={15} />
          </button>
        </>
      }
    >
      {/* Phase 16 以降: Think 抽出、全文検索ボタンをここに追加 */}
    </PanelRibbon>
  );
}
