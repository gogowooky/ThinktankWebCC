/**
 * MediaSettingsPanel.tsx
 * ②パネル: フォーカスメディアの設定。
 * - チェックボタン（変更不可）: pickupに含まれるか
 * - 表示データのタイトル
 * - メディア選択ボタン群
 * - ハイライト用 履歴付きtextbox
 *
 * Phase 9Ex1: スケルトン実装
 */

import React, { useState } from 'react';
import { TTApplication } from '../../../views/TTApplication';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import type { ViewType, ContentType } from '../../../types';

/** ContentType ごとに利用可能なメディア */
const AVAILABLE_MEDIA: Record<ContentType, ViewType[]> = {
  memo:   ['texteditor', 'markdown', 'graph'],
  chat:   ['texteditor', 'markdown', 'chat'],
  pickup: ['texteditor', 'markdown', 'datagrid', 'graph'],
  link:   ['texteditor', 'markdown', 'datagrid', 'graph'],
  table:  ['texteditor', 'datagrid', 'graph'],
};

const MEDIA_LABELS: Record<ViewType, string> = {
  texteditor: 'テキスト',
  markdown:   'MD',
  datagrid:   'グリッド',
  graph:      'グラフ',
  chat:       'チャット',
};

export function MediaSettingsPanel() {
  const app = TTApplication.Instance;
  useAppUpdate(app.MainPanel);

  const activeTab = app.MainPanel.ActiveTab;
  const currentItemId = activeTab?.CurrentItemID ?? '';
  const currentViewType = activeTab?.ViewType ?? 'texteditor';

  // モック: 現在アイテムのContentType（Phase 13 で実データに置換）
  const mockContentType: ContentType = 'memo';
  const isInPickup = true; // pickup に含まれるか（変更不可）
  const itemTitle   = currentItemId ? 'サンプルメモ1' : '（未選択）';

  const [highlight, setHighlight] = useState('');
  const [highlightHistory, setHighlightHistory] = useState<string[]>([]);

  const handleHighlightSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && highlight.trim()) {
      setHighlightHistory(prev =>
        [highlight, ...prev.filter(h => h !== highlight)].slice(0, 20)
      );
    }
  };

  const availableMedia = AVAILABLE_MEDIA[mockContentType] ?? [];

  return (
    <div className="panel-content media-settings-panel">
      {/* pickup 所属チェック（変更不可） */}
      <div className="media-info-row">
        <input type="checkbox" checked={isInPickup} readOnly disabled />
        <span className="media-info-label">pickup に含まれる</span>
      </div>

      {/* 表示データのタイトル */}
      <div className="media-title">{itemTitle}</div>

      {/* メディア選択ボタン */}
      <div className="media-selector">
        {availableMedia.map(media => (
          <button
            key={media}
            className={`media-btn${currentViewType === media ? ' media-btn--active' : ''}`}
            onClick={() => activeTab && app.MainPanel.SetActiveTabViewType(media)}
            disabled={!activeTab}
          >
            {MEDIA_LABELS[media]}
          </button>
        ))}
      </div>

      {/* ハイライト用textbox */}
      <div className="filter-row">
        <input
          className="filter-input"
          type="text"
          placeholder="ハイライト..."
          value={highlight}
          onChange={e => setHighlight(e.target.value)}
          onKeyDown={handleHighlightSubmit}
          list="highlight-history"
        />
        <datalist id="highlight-history">
          {highlightHistory.map(h => <option key={h} value={h} />)}
        </datalist>
      </div>
    </div>
  );
}
