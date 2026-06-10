// パネル間のリサイズを行うドラッグ領域

import { useCallback, useRef } from 'react';
import './Splitter.css';

interface SplitterProps {
  /** ドラッグ移動量(px)を通知。leftGrow=true なら右ドラッグで正 */
  onDrag: (deltaPx: number) => void;
  onDragEnd?: () => void;
}

export function Splitter({ onDrag, onDragEnd }: SplitterProps) {
  const startX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    const onMove = (ev: MouseEvent) => {
      onDrag(ev.clientX - startX.current);
      startX.current = ev.clientX;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      onDragEnd?.();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
  }, [onDrag, onDragEnd]);

  return <div className="splitter" onMouseDown={onMouseDown} />;
}
