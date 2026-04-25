/**
 * FilterPanel.tsx
 * ④パネル: 保管庫フィルタリング。
 * - 保管庫pulldown
 * - filter用 pulldown履歴付きtextbox + 「フィルター作成」ボタン
 * - 保管庫の全データ DataGrid（filterテキストでリアルタイム絞り込み）
 * - 「フィルター作成」→ 絞り込み結果から新規pickupタブを生成
 *
 * Phase 9Ex1: スケルトン実装（データはモック）
 * Phase 13 以降: StorageManager と接続
 */

import React, { useState } from 'react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';

// モック保管庫リスト（Phase 9Ex1）
const MOCK_VAULTS = [
  { id: 'main',    label: 'main' },
  { id: 'archive', label: 'archive' },
];

// モックアイテム（Phase 9Ex1）
const MOCK_ITEMS = [
  { id: '2026-04-23-100000', title: 'サンプルメモ1',     type: 'memo' },
  { id: '2026-04-23-100100', title: 'サンプルチャット',   type: 'chat' },
  { id: '2026-04-22-090000', title: 'リンク集',           type: 'link' },
  { id: '2026-04-21-080000', title: 'データテーブル',     type: 'table' },
];

export function FilterPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.LeftPanel);

  const [vaultId,       setVaultId]       = useState(MOCK_VAULTS[0].id);
  const [filter,        setFilter]        = useState('');
  const [filterHistory, setFilterHistory] = useState<string[]>([]);

  const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filter.trim()) {
      setFilterHistory(prev =>
        [filter, ...prev.filter(h => h !== filter)].slice(0, 20)
      );
    }
  };

  const filteredItems = MOCK_ITEMS.filter(item =>
    !filter ||
    item.title.toLowerCase().includes(filter.toLowerCase()) ||
    item.type.includes(filter)
  );

  const handleCreateFilter = () => {
    if (filteredItems.length === 0) return;
    const title = filter ? `フィルター: ${filter}` : 'フィルター結果';
    app.MainPanel.OpenPickupTab('', title);
    // Phase 13 以降: filteredItems の ID 一覧から pickup ファイルを生成して GroupID にセット
  };

  return (
    <div className="panel-content filter-panel">
      {/* 保管庫pulldown */}
      <select
        className="vault-select"
        value={vaultId}
        onChange={e => setVaultId(e.target.value)}
      >
        {MOCK_VAULTS.map(v => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>

      {/* filter textbox + ボタン */}
      <div className="filter-row">
        <input
          className="filter-input"
          type="text"
          placeholder="フィルター..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={handleFilterKeyDown}
          list="filter-panel-history"
        />
        <datalist id="filter-panel-history">
          {filterHistory.map(h => <option key={h} value={h} />)}
        </datalist>
        <button
          className="action-btn"
          onClick={handleCreateFilter}
          disabled={filteredItems.length === 0}
          title="絞り込み結果で新規タブを作成"
        >
          作成
        </button>
      </div>

      {/* DataGrid */}
      <div className="mini-datagrid">
        <div className="mini-datagrid__header">
          <span className="mini-datagrid__col mini-datagrid__col--title">タイトル</span>
          <span className="mini-datagrid__col mini-datagrid__col--type">種別</span>
        </div>
        {filteredItems.map(item => (
          <div
            key={item.id}
            className="mini-datagrid__row"
            onClick={() => app.MainPanel.OpenPickupTab(item.id, item.title)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && app.MainPanel.OpenPickupTab(item.id, item.title)}
          >
            <span className="mini-datagrid__col mini-datagrid__col--title" title={item.title}>
              {item.title}
            </span>
            <span className="mini-datagrid__col mini-datagrid__col--type">{item.type}</span>
          </div>
        ))}
        {filteredItems.length === 0 && (
          <div className="mini-datagrid__empty">該当なし</div>
        )}
      </div>
    </div>
  );
}
