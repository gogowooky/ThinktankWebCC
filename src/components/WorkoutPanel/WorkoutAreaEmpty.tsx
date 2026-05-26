/**
 * WorkoutAreaEmpty.tsx
 * Phase 7: 空の WorkoutArea スロット（ドロップゾーン）。
 *
 * ドラッグ中に他のエリアの代替ターゲットとして表示する。
 * または WorkoutPanel に1つもエリアがない場合に全面表示する。
 */

import { Plus } from 'lucide-react';
import './WorkoutAreaEmpty.css';

interface Props {
  /** true のとき WorkoutPanel 全体を占める初期状態 */
  isFullPanel?: boolean;
  /** ドラッグ中のエリアのドロップ先として強調表示する */
  isDropTarget?: boolean;
  /** 「追加」ボタンのコールバック */
  onAdd?: () => void;
}

export function WorkoutAreaEmpty({ isFullPanel, isDropTarget, onAdd }: Props) {
  return (
    <div
      className={[
        'workout-area-empty',
        isFullPanel   ? 'workout-area-empty--full'   : '',
        isDropTarget  ? 'workout-area-empty--target'  : '',
      ].join(' ')}
    >
      {onAdd && (
        <button className="workout-area-empty__add" onClick={onAdd} title="エリアを追加">
          <Plus size={20} />
          <span>エリアを追加</span>
        </button>
      )}
    </div>
  );
}
