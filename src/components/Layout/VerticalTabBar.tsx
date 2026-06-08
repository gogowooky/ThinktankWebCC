/**
 * VerticalTabBar.tsx
 * 各パネル共通の縦型タブバー（旧リボン）。
 *
 * - 常時表示（開閉によって非表示にならない）
 * - パネルテーマ色を背景に持つ
 * - 開閉トグルボタンを末尾（または先頭）に配置
 * - side='left'  のとき chevron は右向き（Area が右にある）
 * - side='right' のとき chevron は左向き（Area が左にある）
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import './VerticalTabBar.css';

export type PanelSide = 'left' | 'right';

interface Props {
  /** パネル識別子（CSS クラス名 & data 属性用）*/
  panelId: 'thinktank' | 'overview' | 'workout' | 'rethink';
  /** タブバーを表示するパネルの向き（Area が tab-bar のどちら側にあるか）*/
  side?: PanelSide;
  /** Area の開閉状態 */
  isOpen: boolean;
  /** 開閉トグルコールバック */
  onToggle: () => void;
  /** タブバー内（上部）に表示するタブ（アイコンボタン群） */
  children?: ReactNode;
  /** タブバー下部に固定表示するボタン群 */
  bottomChildren?: ReactNode;
  /** タブバー最下部に縦書きで表示するラベル */
  bottomLabel?: string;
  /** D&D ドロップ受け入れ中フラグ（ハイライト用）*/
  isDragOver?: boolean;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}

export function VerticalTabBar({
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
  // left  側 tab-bar: 閉じているとき右向き▶（開く）、開いているとき左向き◀（閉じる）
  // right 側 tab-bar: 閉じているとき左向き◀（開く）、開いているとき右向き▶（閉じる）
  const showChevronRight =
    (side === 'left' && !isOpen) || (side === 'right' && isOpen);

  return (
    <div
      className={`vertical-tab-bar vertical-tab-bar--${panelId}${isDragOver ? ' vertical-tab-bar--drag-over' : ''}`}
      data-panel={panelId}
      data-side={side}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 開閉トグルボタン（先頭）*/}
      <button
        className="vertical-tab-bar__toggle"
        onClick={onToggle}
        data-tip={isOpen ? 'エリアを閉じる' : 'エリアを開く'}
        aria-label={isOpen ? 'エリアを閉じる' : 'エリアを開く'}
      >
        {showChevronRight
          ? <ChevronRight size={14} />
          : <ChevronLeft size={14} />
        }
      </button>

      {/* タブボタン群（メイン） */}
      {children && <div className="vertical-tab-bar__buttons">{children}</div>}

      {/* 下部固定ボタン群（設定ボタンなど） */}
      {bottomChildren && (
        <div className="vertical-tab-bar__bottom">{bottomChildren}</div>
      )}

      {/* スペーサー */}
      <div className="vertical-tab-bar__spacer" />

      {/* 最下部ラベル（左90度・下寄せ） */}
      {bottomLabel && (
        <div className="vertical-tab-bar__label-wrap" data-tip={bottomLabel} data-tip-side={side === 'left' ? 'right' : 'left'}>
          <span className="vertical-tab-bar__label">{bottomLabel}</span>
        </div>
      )}
    </div>
  );
}
