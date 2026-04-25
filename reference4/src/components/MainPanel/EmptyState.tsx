/**
 * EmptyState.tsx
 * タブが 0 のときにメインパネルに表示するウェルカム画面。
 *
 * Phase 5: 骨格実装
 */

import React from 'react';
import { FileText } from 'lucide-react';
import './EmptyState.css';

export function EmptyState() {
  return (
    <div className="empty-state">
      <FileText size={40} className="empty-state__icon" />
      <p className="empty-state__title">Thinktank</p>
      <p className="empty-state__hint">
        リボンのアイコンをクリックしてナビゲーターを開き、
        <br />
        ファイルを選択してください。
      </p>
    </div>
  );
}
