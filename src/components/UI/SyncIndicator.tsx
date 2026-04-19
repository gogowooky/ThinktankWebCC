/**
 * SyncIndicator.tsx
 * 同期状態を示すバッジ。TabBar 右端に常時表示する。
 *
 * Phase 5: 骨格実装（固定ダミー状態）
 * Phase 15 以降: StorageManager.getSyncStatus() に接続
 */

import React from 'react';
import { Loader2, WifiOff, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SyncStatus } from '../../types';
import './SyncIndicator.css';

interface Props {
  status: SyncStatus;
}

export function SyncIndicator({ status }: Props) {
  switch (status.state) {
    case 'syncing':
      return (
        <span className="sync-indicator sync-indicator--syncing" title="同期中...">
          <Loader2 size={11} className="sync-spinner" />
          {status.pendingCount > 0 && <span>{status.pendingCount}</span>}
        </span>
      );

    case 'pending':
      return (
        <span className="sync-indicator sync-indicator--pending" title={`未送信 ${status.pendingCount} 件`}>
          ●{status.pendingCount}
        </span>
      );

    case 'offline':
      return (
        <span className="sync-indicator sync-indicator--offline" title="オフライン">
          <WifiOff size={11} />
        </span>
      );

    case 'error':
    case 'conflict':
      return (
        <span className="sync-indicator sync-indicator--error" title={status.errorMessage ?? '同期エラー'}>
          <AlertCircle size={11} />
        </span>
      );

    case 'synced':
    default:
      return (
        <span className="sync-indicator sync-indicator--synced" title="同期済み">
          <CheckCircle2 size={11} />
        </span>
      );
  }
}
