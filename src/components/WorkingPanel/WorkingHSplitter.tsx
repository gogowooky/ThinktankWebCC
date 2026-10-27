/**
 * WorkingHSplitter.tsx
 * WorkingPanel の行間水平スプリッター（row-resize）。
 * pointer capture を使用してパネル外へのカーソル移動でもドラッグが途切れない。
 */

import { useSplitterDrag } from '../../hooks/useSplitterDrag';
import './WorkingHSplitter.css';

interface Props {
  onResize: (deltaY: number) => void;
  onResizeEnd?: () => void;
}

export function WorkingHSplitter({ onResize, onResizeEnd }: Props) {
  const { isDragging, handlePointerDown, handlePointerMove, handlePointerUp } =
    useSplitterDrag('y', onResize, onResizeEnd);

  return (
    <div
      className={`working-h-splitter${isDragging ? ' working-h-splitter--dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="行の高さを変更"
    />
  );
}
