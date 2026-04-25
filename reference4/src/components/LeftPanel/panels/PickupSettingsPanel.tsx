/**
 * PickupSettingsPanel.tsx
 * ①パネル: フォーカスpickupタブの設定。
 * - pickupデータのID/アイテム数/タイトル
 * - DataGrid filter用 pulldown履歴付きtextbox
 * - pickupの子アイテム一覧DataGrid（チェック列付き）
 *
 * Phase 9Ex1: スケルトン実装（データはモック）
 * Phase 13 以降: StorageManager と接続して実データを表示
 */

import React, { useState } from 'react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';

export function PickupSettingsPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.MainPanel);

  const activeTab = app.MainPanel.ActiveTab;
  const groupId   = activeTab?.GroupID ?? '';
  const tabTitle  = activeTab?.Name ?? '（タブなし）';

  const [filter, setFilter] = useState('');
  const [filterHistory, setFilterHistory] = useState<string[]>([]);

  const handleFilterSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filter.trim()) {
      setFilterHistory(prev =>
        [filter, ...prev.filter(h => h !== filter)].slice(0, 20)
      );
    }
  };

  // モックアイテム（Phase 13 で実データに置換）
  const mockItems = groupId
    ? [
        { id: '2026-04-23-100000', title: 'サンプルメモ1', type: 'memo', displayed: true },
        { id: '2026-04-23-100100', title: 'サンプルチャット', type: 'chat', displayed: false },
      ]
    : [];

  const currentItemId = activeTab?.CurrentItemID ?? '';

  return (
    <div className="panel-content pickup-settings-panel">
      {/* pickup メタ情報 */}
      <div className="pickup-info">
        <div className="pickup-info__row">
          <span className="pickup-info__label">ID</span>
          <span className="pickup-info__value mono">{groupId || '（全データ）'}</span>
        </div>
        <div className="pickup-info__row">
          <span className="pickup-info__label">件数</span>
          <span className="pickup-info__value">{mockItems.length}</span>
        </div>
        <div className="pickup-info__row">
          <span className="pickup-info__label">タイトル</span>
          <span className="pickup-info__value">{tabTitle}</span>
        </div>
      </div>

      {/* フィルターtextbox */}
      <div className="filter-row">
        <input
          className="filter-input"
          type="text"
          placeholder="フィルター..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={handleFilterSubmit}
          list="pickup-filter-history"
        />
        <datalist id="pickup-filter-history">
          {filterHistory.map(h => <option key={h} value={h} />)}
        </datalist>
      </div>

      {/* アイテム一覧DataGrid */}
      <div className="mini-datagrid">
        <div className="mini-datagrid__header">
          <span className="mini-datagrid__col mini-datagrid__col--check">表示</span>
          <span className="mini-datagrid__col mini-datagrid__col--title">タイトル</span>
          <span className="mini-datagrid__col mini-datagrid__col--type">種別</span>
        </div>
        {mockItems
          .filter(item => !filter || item.title.includes(filter))
          .map(item => (
            <div
              key={item.id}
              className={`mini-datagrid__row${item.id === currentItemId ? ' mini-datagrid__row--active' : ''}`}
              onClick={() => activeTab?.NavigateTo(item.id)}
            >
              <span className="mini-datagrid__col mini-datagrid__col--check">
                {item.id === currentItemId ? '✓' : ''}
              </span>
              <span className="mini-datagrid__col mini-datagrid__col--title" title={item.title}>
                {item.title}
              </span>
              <span className="mini-datagrid__col mini-datagrid__col--type">{item.type}</span>
            </div>
          ))}
        {mockItems.length === 0 && (
          <div className="mini-datagrid__empty">アイテムなし</div>
        )}
      </div>
    </div>
  );
}
