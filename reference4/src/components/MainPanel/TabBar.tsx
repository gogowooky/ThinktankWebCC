/**
 * TabBar.tsx
 * メインパネル上部のタブバー。
 * - タブ一覧をスクロール可能に表示する
 * - アクティブタブにアクセントボーダー
 * - 閉じるボタン（×）
 * - 右端に SyncIndicator を常時表示
 *
 * Phase 5: 骨格実装
 */

import React from 'react';
import { X } from 'lucide-react';
import { SyncIndicator } from '../UI/SyncIndicator';
import type { TTTab } from '../../views/TTTab';
import type { SyncStatus } from '../../types';
import './TabBar.css';

interface Props {
  tabs: ReadonlyArray<TTTab>;
  activeTabId: string;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  syncStatus: SyncStatus;
}

export function TabBar({ tabs, activeTabId, onSwitch, onClose, syncStatus }: Props) {
  return (
    <div className="tabbar" role="tablist">
      <div className="tabbar__tabs">
        {tabs.map(tab => (
          <button
            key={tab.ID}
            role="tab"
            aria-selected={tab.ID === activeTabId}
            className={`tabbar__tab${tab.ID === activeTabId ? ' tabbar__tab--active' : ''}`}
            onClick={() => onSwitch(tab.ID)}
            title={tab.Name}
          >
            <span className="tabbar__tab-title">{tab.DisplayTitle}</span>
            <span
              className="tabbar__tab-close"
              role="button"
              aria-label={`${tab.Name} を閉じる`}
              onClick={e => { e.stopPropagation(); onClose(tab.ID); }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
      </div>

      <div className="tabbar__sync">
        <SyncIndicator status={syncStatus} />
      </div>
    </div>
  );
}
