/**
 * WorkoutHSplitter.tsx
 * Phase 7: WorkoutPanel の行間水平スプリッター（row-resize）。
 * pointer capture を使用してパネル外へのカーソル移動でもドラッグが途切れない。
 */

import React, { useCallback, useRef, useState } from 'react';
import './WorkoutHSplitter.css';

interface Props {
  onResize: (deltaY: number) => void;
  onResizeEnd?: () => void;
}

export function WorkoutHSplitter({ onResize, onResizeEnd }: Props) {
  const dragging = useRef(false);
  const lastY    = useRef(0);
  // ドラッグ中の色付け用。ref と別に持つのは再描画を起こす必要があるため
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    lastY.current    = e.clientY;
    setIsDragging(true);
    document.body.style.cursor    = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta   = e.clientY - lastY.current;
    lastY.current = e.clientY;
    onResize(delta);
  }, [onResize]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    document.body.style.cursor    = '';
    document.body.style.userSelect = '';
    onResizeEnd?.();
  }, [onResizeEnd]);

  return (
    <div
      className={`workout-h-splitter${isDragging ? ' workout-h-splitter--dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="行の高さを変更"
    />
  );
}
