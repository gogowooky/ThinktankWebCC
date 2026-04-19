/**
 * LeftPanelHeader.tsx
 * 左パネルのタイトルバー（種別名 + 閉じるボタン）。
 *
 * Phase 5: 骨格実装
 */

import React from 'react';
import { X } from 'lucide-react';
import type { LeftPanelType } from '../../types';

const PANEL_TITLES: Record<LeftPanelType, string> = {
  navigator: 'ナビゲーター',
  search:    '検索',
  tags:      'タグ',
  recent:    '最近',
};

interface Props {
  panelType: LeftPanelType;
  onClose: () => void;
}

export function LeftPanelHeader({ panelType, onClose }: Props) {
  return (
    <div className="panel-header">
      <span className="panel-header__title">{PANEL_TITLES[panelType]}</span>
      <button
        className="panel-header__close"
        onClick={onClose}
        title="パネルを閉じる"
        aria-label="パネルを閉じる"
      >
        <X size={14} />
      </button>
    </div>
  );
}
