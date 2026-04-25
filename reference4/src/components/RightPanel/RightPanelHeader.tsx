/**
 * RightPanelHeader.tsx
 * 右パネルのタイトルバー（種別名 + 閉じるボタン）。
 *
 * Phase 5: 骨格実装
 */

import React from 'react';
import { X } from 'lucide-react';
import type { RightPanelType } from '../../types';

const PANEL_TITLES: Record<RightPanelType, string> = {
  outline:    'アウトライン',
  properties: 'プロパティ',
  related:    '関連',
  chat:       'チャット',
};

interface Props {
  panelType: RightPanelType;
  onClose: () => void;
}

export function RightPanelHeader({ panelType, onClose }: Props) {
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
