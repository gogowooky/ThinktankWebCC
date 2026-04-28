/**
 * HistoryPanel.tsx
 * ③パネル: 表示済みpickupタブの履歴一覧。
 * - アイテムを選択 → そのpickupを新規タブで生成・表示
 *
 * Phase 9Ex1: スケルトン実装（履歴はセッション内メモリのみ）
 */

import React from 'react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';

export function HistoryPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.MainPanel);

  // モック履歴（Phase 9Ex1 ではタブの履歴をメモリで保持）
  // Phase 41 以降: localStorage に永続化
  const tabs = app.MainPanel.Tabs;
  const historyItems = tabs.map(tab => ({
    groupId: tab.GroupID,
    title:   tab.Name,
    tabId:   tab.ID,
  }));

  const handleSelect = (groupId: string, title: string) => {
    app.MainPanel.OpenPickupTab(groupId, title);
  };

  return (
    <div className="panel-content history-panel">
      {historyItems.length === 0 && (
        <p className="panel-placeholder">履歴はありません</p>
      )}
      {historyItems.map(item => (
        <div
          key={item.tabId}
          className="history-item"
          onClick={() => handleSelect(item.groupId, item.title)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && handleSelect(item.groupId, item.title)}
        >
          <span className="history-item__title">{item.title}</span>
          <span className="history-item__id mono">{item.groupId || '全データ'}</span>
        </div>
      ))}
    </div>
  );
}
