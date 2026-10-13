import { useCallback, useRef, useState, type PointerEvent } from 'react';

/** pointer capture を使い、直前の座標からスプリッターの移動量を通知する。 */
export function useSplitterDrag(
  axis: 'x' | 'y',
  onResize: (delta: number) => void,
  onResizeEnd?: () => void,
) {
  const dragging = useRef(false);
  const lastPosition = useRef(0);
  // ref はイベント間の状態、state はドラッグ中の色付けに使う。
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    lastPosition.current = axis === 'x' ? e.clientX : e.clientY;
    setIsDragging(true);
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [axis]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    const position = axis === 'x' ? e.clientX : e.clientY;
    const delta = position - lastPosition.current;
    lastPosition.current = position;
    onResize(delta);
  }, [axis, onResize]);

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onResizeEnd?.();
  }, [onResizeEnd]);

  return { isDragging, handlePointerDown, handlePointerMove, handlePointerUp };
}
