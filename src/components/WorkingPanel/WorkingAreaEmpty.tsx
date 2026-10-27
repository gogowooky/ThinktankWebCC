/**
 * WorkingAreaEmpty.tsx
 * 空の WorkingArea スロット（ドロップゾーン）。
 *
 * ドラッグ中に他のエリアの代替ターゲットとして表示する。
 * または WorkingPanel に1つもエリアがない場合に全面表示する。
 */

import { Plus } from 'lucide-react';
import './WorkingAreaEmpty.css';

interface Props {
  /** true のとき WorkingPanel 全体を占める初期状態 */
  isFullPanel?: boolean;
  /** ドラッグ中のエリアのドロップ先として強調表示する */
  isDropTarget?: boolean;
  /** 「追加」ボタンのコールバック */
  onAdd?: () => void;
}

export function WorkingAreaEmpty({ isFullPanel, isDropTarget, onAdd }: Props) {
  return (
    <div
      className={[
        'working-area-empty',
        isFullPanel   ? 'working-area-empty--full'   : '',
        isDropTarget  ? 'working-area-empty--target'  : '',
      ].join(' ')}
    >
      {onAdd && (
        <button className="working-area-empty__add" onClick={onAdd} title="エリアを追加">
          <Plus size={20} />
          <span>エリアを追加</span>
        </button>
      )}
    </div>
  );
}
