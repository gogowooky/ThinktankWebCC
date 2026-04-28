/**
 * PanelArea.tsx
 * Phase 5: 各パネル共通のコンテンツエリア（開閉アニメーション付き）。
 *
 * - isOpen=false のとき幅を 0 に収縮（overflow: hidden でコンテンツ非表示）
 * - CSS transition で滑らかにアニメーション
 * - 子コンテンツは minWidth を維持するため内部ラッパーで固定幅を保持する
 */

import type { ReactNode } from 'react';
import './PanelArea.css';

interface Props {
  /** Area の開閉状態 */
  isOpen: boolean;
  /** 開いているときの幅（px）。デフォルト 240 */
  width?: number;
  /** パネル識別子（テーマ色 CSS クラス用）*/
  panelId: 'thinktank' | 'overview' | 'workout' | 'todo';
  children?: ReactNode;
}

export function PanelArea({ isOpen, width = 240, panelId, children }: Props) {
  return (
    <div
      className={`panel-area panel-area--${panelId}${isOpen ? '' : ' panel-area--closed'}`}
      style={{ width: isOpen ? width : 0 }}
    >
      {/* 内部ラッパーで幅を固定し、親のアニメーション中もレイアウト崩れを防ぐ */}
      <div className="panel-area__inner" style={{ width }}>
        {children}
      </div>
    </div>
  );
}
