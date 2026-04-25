/**
 * Splitter.tsx
 * ドラッグで隣接パネルの幅を変更するセパレーター（縦方向 col-resize）。
 */

import React, { useCallback, useRef } from 'react';
import './Splitter.css';

interface Props {
  onResize: (deltaX: number) => void;
  onResizeEnd?: () => void;
}

export function Splitter({ onResize, onResizeEnd }: Props) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - lastX.current;
        lastX.current = ev.clientX;
        onResize(delta);
      };

      const onMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        onResizeEnd?.();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onResize, onResizeEnd]
  );

  return (
    <div
      className="splitter"
      onMouseDown={handleMouseDown}
      aria-label="パネル幅を変更"
    />
  );
}
