/**
 * Splitter.tsx
 * ドラッグで隣接パネルの幅を変更するセパレーター（縦方向 col-resize）。
 * pointer capture を使用してパネル外へのカーソル移動でもドラッグが途切れない。
 */

import { useSplitterDrag } from '../../hooks/useSplitterDrag';
import './Splitter.css';

interface Props {
  onResize: (deltaX: number) => void;
  onResizeEnd?: () => void;
}

export function Splitter({ onResize, onResizeEnd }: Props) {
  const { isDragging, handlePointerDown, handlePointerMove, handlePointerUp } =
    useSplitterDrag('x', onResize, onResizeEnd);

  return (
    <div
      className={`splitter${isDragging ? ' splitter--dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="パネル幅を変更"
    />
  );
}
