/**
 * Splitter.tsx
 * ドラッグで隣接パネルの幅を変更するセパレーター（縦方向 col-resize）。
 * pointer capture を使用してパネル外へのカーソル移動でもドラッグが途切れない。
 */

import React, { useCallback, useRef, useState } from 'react';
import './Splitter.css';

interface Props {
  onResize: (deltaX: number) => void;
  onResizeEnd?: () => void;
}

export function Splitter({ onResize, onResizeEnd }: Props) {
  const dragging = useRef(false);
  const lastX    = useRef(0);
  // ドラッグ中の色付け用。ref と別に持つのは再描画を起こす必要があるため
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);   // カーソルが外に出てもイベント受信継続
    dragging.current = true;
    lastX.current    = e.clientX;
    setIsDragging(true);
    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta   = e.clientX - lastX.current;
    lastX.current = e.clientX;
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
      className={`splitter${isDragging ? ' splitter--dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="パネル幅を変更"
    />
  );
}
