/**
 * FulltextSearchPanel.tsx
 * ⑤パネル: 保管庫全文検索。
 * - 保管庫pulldown
 * - キーワード用 履歴付きtextbox + 「全文検索ヒット作成」ボタン
 * - ヒットアイテム DataGrid
 * - 「全文検索ヒット作成」→ ヒット結果から新規pickupタブを生成
 *
 * Phase 9Ex1: スケルトン実装（検索はモック）
 * Phase 28 以降: StorageManager の全文検索と接続
 */

import React, { useState } from 'react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';

const MOCK_VAULTS = [
  { id: 'main',    label: 'main' },
  { id: 'archive', label: 'archive' },
];

const MOCK_ITEMS = [
  { id: '2026-04-23-100000', title: 'サンプルメモ1',     type: 'memo',  excerpt: 'これはサンプルのメモです。' },
  { id: '2026-04-23-100100', title: 'サンプルチャット',   type: 'chat',  excerpt: 'AIとの対話記録サンプル。' },
  { id: '2026-04-22-090000', title: 'リンク集',           type: 'link',  excerpt: 'https://example.com' },
  { id: '2026-04-21-080000', title: 'データテーブル',     type: 'table', excerpt: 'col1,col2\nval1,val2' },
];

export function FulltextSearchPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.LeftPanel);

  const [vaultId,  setVaultId]  = useState(MOCK_VAULTS[0].id);
  const [keyword,  setKeyword]  = useState('');
  const [history,  setHistory]  = useState<string[]>([]);
  const [results,  setResults]  = useState<typeof MOCK_ITEMS>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = () => {
    if (!keyword.trim()) return;
    setHistory(prev => [keyword, ...prev.filter(h => h !== keyword)].slice(0, 20));
    // モック検索（Phase 28 以降: 実際の全文検索に置換）
    const hits = MOCK_ITEMS.filter(
      item =>
        item.title.toLowerCase().includes(keyword.toLowerCase()) ||
        item.excerpt.toLowerCase().includes(keyword.toLowerCase())
    );
    setResults(hits);
    setSearched(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleCreateHit = () => {
    if (results.length === 0) return;
    const title = `全文検索: ${keyword}`;
    app.MainPanel.OpenPickupTab('', title);
    // Phase 28 以降: results の ID 一覧から pickup ファイルを生成して GroupID にセット
  };

  return (
    <div className="panel-content fulltext-search-panel">
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

      {/* キーワードtextbox + ボタン */}
      <div className="filter-row">
        <input
          className="filter-input"
          type="text"
          placeholder="キーワード検索..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          list="fulltext-history"
        />
        <datalist id="fulltext-history">
          {history.map(h => <option key={h} value={h} />)}
        </datalist>
        <button className="action-btn" onClick={handleSearch}>検索</button>
      </div>

      {searched && (
        <button
          className="action-btn action-btn--block"
          onClick={handleCreateHit}
          disabled={results.length === 0}
          title="ヒット結果で新規タブを作成"
        >
          全文検索ヒット作成
        </button>
      )}

      {/* DataGrid */}
      {searched && (
        <div className="mini-datagrid">
          <div className="mini-datagrid__header">
            <span className="mini-datagrid__col mini-datagrid__col--title">タイトル</span>
            <span className="mini-datagrid__col mini-datagrid__col--type">種別</span>
          </div>
          {results.map(item => (
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
          {results.length === 0 && (
            <div className="mini-datagrid__empty">ヒットなし</div>
          )}
        </div>
      )}
    </div>
  );
}
