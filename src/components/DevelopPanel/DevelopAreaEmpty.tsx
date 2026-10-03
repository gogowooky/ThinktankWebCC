/**
 * DevelopAreaEmpty.tsx
 * Phase 7: 空の DevelopArea スロット（ドロップゾーン）。
 *
 * ドラッグ中に他のエリアの代替ターゲットとして表示する。
 * または DevelopPanel に1つもエリアがない場合に全面表示する。
 */

import { Plus } from 'lucide-react';
import './DevelopAreaEmpty.css';

interface Props {
  /** true のとき DevelopPanel 全体を占める初期状態 */
  isFullPanel?: boolean;
  /** ドラッグ中のエリアのドロップ先として強調表示する */
  isDropTarget?: boolean;
  /** 「追加」ボタンのコールバック */
  onAdd?: () => void;
}

export function DevelopAreaEmpty({ isFullPanel, isDropTarget, onAdd }: Props) {
  return (
    <div
      className={[
        'develop-area-empty',
        isFullPanel   ? 'develop-area-empty--full'   : '',
        isDropTarget  ? 'develop-area-empty--target'  : '',
      ].join(' ')}
    >
      {onAdd && (
        <button className="develop-area-empty__add" onClick={onAdd} title="エリアを追加">
          <Plus size={20} />
          <span>エリアを追加</span>
        </button>
      )}
    </div>
  );
}
