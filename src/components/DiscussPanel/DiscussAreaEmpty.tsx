/**
 * DiscussAreaEmpty.tsx
 * Phase 7: 空の DiscussArea スロット（ドロップゾーン）。
 *
 * ドラッグ中に他のエリアの代替ターゲットとして表示する。
 * または DiscussPanel に1つもエリアがない場合に全面表示する。
 */

import { Plus } from 'lucide-react';
import './DiscussAreaEmpty.css';

interface Props {
  /** true のとき DiscussPanel 全体を占める初期状態 */
  isFullPanel?: boolean;
  /** ドラッグ中のエリアのドロップ先として強調表示する */
  isDropTarget?: boolean;
  /** 「追加」ボタンのコールバック */
  onAdd?: () => void;
}

export function DiscussAreaEmpty({ isFullPanel, isDropTarget, onAdd }: Props) {
  return (
    <div
      className={[
        'discuss-area-empty',
        isFullPanel   ? 'discuss-area-empty--full'   : '',
        isDropTarget  ? 'discuss-area-empty--target'  : '',
      ].join(' ')}
    >
      {onAdd && (
        <button className="discuss-area-empty__add" onClick={onAdd} title="エリアを追加">
          <Plus size={20} />
          <span>エリアを追加</span>
        </button>
      )}
    </div>
  );
}
