/**
 * PanelRibbon.tsx
 * Phase 5: 各パネル共通の縦アイコンバー（Ribbon）。
 *
 * - 常時表示（開閉によって非表示にならない）
 * - パネルテーマ色を背景に持つ
 * - 開閉トグルボタンを末尾に配置
 * - side='left'  のとき chevron は右向き（Area が右にある）
 * - side='right' のとき chevron は左向き（Area が左にある）
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import './PanelRibbon.css';

export type PanelSide = 'left' | 'right';

interface Props {
  /** パネル識別子（CSS クラス名 & data 属性用）*/
  panelId: 'thinktank' | 'overview' | 'workout' | 'rethink';
  /** Ribbon を表示するパネルの向き（Area が ribbon のどちら側にあるか）*/
  side?: PanelSide;
  /** Area の開閉状態 */
  isOpen: boolean;
  /** 開閉トグルコールバック */
  onToggle: () => void;
  /** Ribbon 内（上部）に表示する追加ボタン群 */
  children?: ReactNode;
  /** Ribbon 下部に固定表示するボタン群 */
  bottomChildren?: ReactNode;
  /** Ribbon 最下部に縦書きで表示するラベル */
  bottomLabel?: string;
  /** D&D ドロップ受け入れ中フラグ（ハイライト用）*/
  isDragOver?: boolean;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}

export function PanelRibbon({
  panelId,
  side = 'left',
  isOpen,
  onToggle,
  children,
  bottomChildren,
  bottomLabel,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  // 開閉矢印の向きを決定
  // left  側 ribbon: 閉じているとき右向き▶（開く）、開いているとき左向き◀（閉じる）
  // right 側 ribbon: 閉じているとき左向き◀（開く）、開いているとき右向き▶（閉じる）
  const showChevronRight =
    (side === 'left' && !isOpen) || (side === 'right' && isOpen);

  return (
    <div
      className={`panel-ribbon panel-ribbon--${panelId}${isDragOver ? ' panel-ribbon--drag-over' : ''}`}
      data-panel={panelId}
      data-side={side}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 開閉トグルボタン（先頭）*/}
      <button
        className="panel-ribbon__toggle"
        onClick={onToggle}
        title={isOpen ? 'エリアを閉じる' : 'エリアを開く'}
        aria-label={isOpen ? 'エリアを閉じる' : 'エリアを開く'}
      >
        {showChevronRight
          ? <ChevronRight size={14} />
          : <ChevronLeft size={14} />
        }
      </button>

      {/* ユーザー定義ボタン */}
      {children && <div className="panel-ribbon__buttons">{children}</div>}

      {/* 上寄せ固定ボタン群（モードボタン直下）*/}
      {bottomChildren && (
        <div className="panel-ribbon__bottom">{bottomChildren}</div>
      )}

      {/* スペーサー */}
      <div className="panel-ribbon__spacer" />

      {/* 最下部ラベル（左90度・下寄せ）*/}
      {bottomLabel && (
        <div className="panel-ribbon__label-wrap" title={bottomLabel}>
          <span className="panel-ribbon__label">{bottomLabel}</span>
        </div>
      )}
    </div>
  );
}
