/**
 * DiscussHSplitter.tsx
 * DiscussPanel の行間水平スプリッター（row-resize）。
 * pointer capture を使用してパネル外へのカーソル移動でもドラッグが途切れない。
 */

import { useSplitterDrag } from '../../hooks/useSplitterDrag';
import './DiscussHSplitter.css';

interface Props {
  onResize: (deltaY: number) => void;
  onResizeEnd?: () => void;
}

export function DiscussHSplitter({ onResize, onResizeEnd }: Props) {
  const { isDragging, handlePointerDown, handlePointerMove, handlePointerUp } =
    useSplitterDrag('y', onResize, onResizeEnd);

  return (
    <div
      className={`discuss-h-splitter${isDragging ? ' discuss-h-splitter--dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="行の高さを変更"
    />
  );
}
