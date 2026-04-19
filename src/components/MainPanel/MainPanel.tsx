/**
 * MainPanel.tsx
 * メインパネルのコンテナ。タブバー + コンテンツエリア。
 *
 * Phase 5: 骨格実装（コンテンツエリアはプレースホルダー）
 * Phase 7 以降: TextEditorView / MarkdownView 等を差し込む
 */

import React from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TabBar } from './TabBar';
import { EmptyState } from './EmptyState';
import type { SyncStatus } from '../../types';
import './MainPanel.css';

/** Phase 15 まで使用する固定ダミー同期状態 */
const DUMMY_SYNC: SyncStatus = {
  state: 'synced',
  pendingCount: 0,
  isSyncing: false,
  isOnline: true,
  lastSyncAt: null,
};

export function MainPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.MainPanel);
  const mp = app.MainPanel;

  return (
    <div className="main-panel">
      <TabBar
        tabs={mp.Tabs}
        activeTabId={mp.ActiveTab?.ID ?? ''}
        onSwitch={id => mp.SwitchTab(id)}
        onClose={id => mp.CloseTab(id)}
        syncStatus={DUMMY_SYNC}
      />

      <div className="main-panel__content">
        {mp.Tabs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="main-panel__editor-placeholder">
            {/* Phase 7 以降で ViewType に応じたコンポーネントに置き換え */}
            <p className="main-panel__editor-placeholder-text">
              {mp.ActiveTab?.Name}
            </p>
            <p className="main-panel__editor-placeholder-hint">
              TextEditorView は Phase 7 で実装
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
