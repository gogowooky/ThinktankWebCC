/**
 * ViewToolbar.tsx
 * メインパネルのコンテンツエリア上部ツールバー。
 * Editor / Preview のビュー切り替えボタンを提供する。
 *
 * Phase 8: Editor ↔ Markdown プレビュー トグル
 * Phase 以降: その他のビュー種別ボタン追加
 */

import React from 'react';
import { Pencil, Eye } from 'lucide-react';
import type { ViewType } from '../../types';
import './ViewToolbar.css';

interface Props {
  viewType: ViewType;
  onSwitch: (viewType: ViewType) => void;
}

export function ViewToolbar({ viewType, onSwitch }: Props) {
  return (
    <div className="view-toolbar">
      <div className="view-toolbar__spacer" />
      <div className="view-toolbar__toggles" role="group" aria-label="表示モード切り替え">
        <button
          className={`view-toolbar__btn${viewType === 'texteditor' ? ' view-toolbar__btn--active' : ''}`}
          onClick={() => onSwitch('texteditor')}
          title="編集モード"
          aria-pressed={viewType === 'texteditor'}
        >
          <Pencil size={13} />
          <span>編集</span>
        </button>
        <button
          className={`view-toolbar__btn${viewType === 'markdown' ? ' view-toolbar__btn--active' : ''}`}
          onClick={() => onSwitch('markdown')}
          title="プレビューモード"
          aria-pressed={viewType === 'markdown'}
        >
          <Eye size={13} />
          <span>プレビュー</span>
        </button>
      </div>
    </div>
  );
}
