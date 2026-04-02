import { useCallback, useRef } from 'react';

/**
 * Splitter - ドラッグでリサイズするスプリッタバー
 *
 * direction:
 *   'horizontal' → 左右分割（列間）。ドラッグで左右幅を変更
 *   'vertical'   → 上下分割（パネル間）。ドラッグで上下高さを変更
 *
 * onResize(delta): ドラッグ移動量(px)を親に通知
 */

export interface SplitterProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

export function Splitter({ direction, onResize }: SplitterProps) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = current - lastPos.current;
      if (delta !== 0) {
        onResize(delta);
        lastPos.current = current;
      }
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction, onResize]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`splitter splitter-${direction}`}
      onMouseDown={handleMouseDown}
      style={{
        flexShrink: 0,
        width: isHorizontal ? 4 : '100%',
        height: isHorizontal ? '100%' : 4,
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        backgroundColor: '#333',
        transition: 'background-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0078d4')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#333')}
    />
  );
}
