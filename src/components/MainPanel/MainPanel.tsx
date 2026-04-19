/**
 * MainPanel.tsx
 * メインパネルのコンテナ。タブバー + コンテンツエリア。
 *
 * Phase 5: 骨格実装（コンテンツエリアはプレースホルダー）
 * Phase 7: TextEditorView を組み込み（viewType === 'texteditor'）
 * Phase 8 以降: MarkdownView 等を追加
 */

import React from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { TabBar } from './TabBar';
import { EmptyState } from './EmptyState';
import { TextEditorView } from './views/TextEditorView';
import { MarkdownView } from './views/MarkdownView';
import { ViewToolbar } from './ViewToolbar';
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
        ) : mp.ActiveTab ? (
          <>
            {/* Editor / Preview トグルツールバー */}
            <ViewToolbar
              viewType={mp.ActiveTab.ViewType}
              onSwitch={vt => mp.SetActiveTabViewType(vt)}
            />

            {/* ビュー本体（key={tab.ID} でタブ切替時に再マウント） */}
            {mp.ActiveTab.ViewType === 'texteditor' ? (
              <TextEditorView key={mp.ActiveTab.ID} tab={mp.ActiveTab} />
            ) : mp.ActiveTab.ViewType === 'markdown' ? (
              <MarkdownView key={mp.ActiveTab.ID} tab={mp.ActiveTab} />
            ) : (
              <div className="main-panel__editor-placeholder">
                <p className="main-panel__editor-placeholder-text">
                  {mp.ActiveTab.Name}
                </p>
                <p className="main-panel__editor-placeholder-hint">
                  {mp.ActiveTab.ViewType} ビューは今後実装予定
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
