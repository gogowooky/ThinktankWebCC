// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Splitter } from '../components/Layout/Splitter';
import { DiscussHSplitter } from '../components/DiscussPanel/DiscussHSplitter';

const splitters = [
  { name: 'panel width', Component: Splitter, axis: 'x', className: 'splitter', label: 'パネル幅を変更', cursor: 'col-resize' },
  { name: 'Discuss row height', Component: DiscussHSplitter, axis: 'y', className: 'discuss-h-splitter', label: '行の高さを変更', cursor: 'row-resize' },
] as const;

describe.each(splitters)('$name splitter', ({ Component, axis, className, label, cursor }) => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let previousCursor: string;
  let previousUserSelect: string;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    previousCursor = document.body.style.cursor;
    previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    vi.unstubAllGlobals();
  });

  async function render(onResize: (delta: number) => void, onResizeEnd?: () => void) {
    await act(async () => root.render(<Component onResize={onResize} onResizeEnd={onResizeEnd} />));
    const element = host.firstElementChild as HTMLDivElement;
    element.setPointerCapture = vi.fn();
    return element;
  }

  async function pointer(element: HTMLDivElement, type: string, position = 100, otherAxis = 900) {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      clientX: axis === 'x' ? position : otherAxis,
      clientY: axis === 'y' ? position : otherAxis,
    });
    await act(async () => { element.dispatchEvent(event); });
    return event;
  }

  it('captures the pointer and reports consecutive movement on its own axis', async () => {
    const onResize = vi.fn();
    const element = await render(onResize);
    expect(element.tagName).toBe('DIV');
    expect(element.className).toBe(className);
    expect(element.getAttribute('aria-label')).toBe(label);

    const down = await pointer(element, 'pointerdown');
    expect(down.defaultPrevented).toBe(true);
    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
    expect(element.className).toBe(`${className} ${className}--dragging`);
    expect(document.body.style.cursor).toBe(cursor);
    expect(document.body.style.userSelect).toBe('none');

    await pointer(element, 'pointermove', 112, 800);
    await pointer(element, 'pointermove', 107, 1200);
    await pointer(element, 'pointermove', 107, 100);
    expect(onResize.mock.calls).toEqual([[12], [-5], [0]]);
    await pointer(element, 'pointerup');
  });

  it.each(['pointerup', 'pointercancel'])('ends once on %s and ignores later movement', async type => {
    const onResize = vi.fn();
    const onResizeEnd = vi.fn(() => {
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    });
    const element = await render(onResize, onResizeEnd);
    await pointer(element, 'pointerdown');
    await pointer(element, 'pointermove', 110);
    await pointer(element, type, 110);
    expect(element.className).toBe(className);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);

    await pointer(element, 'pointermove', 120);
    await pointer(element, 'pointerup', 120);
    await pointer(element, 'pointercancel', 120);
    expect(onResize.mock.calls).toEqual([[10]]);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it('keeps the drag position across renders and calls the latest callbacks', async () => {
    const initialResize = vi.fn();
    const initialEnd = vi.fn();
    const element = await render(initialResize, initialEnd);
    await pointer(element, 'pointerdown');
    await pointer(element, 'pointermove', 110);

    const nextResize = vi.fn();
    const nextEnd = vi.fn();
    expect(await render(nextResize, nextEnd)).toBe(element);
    await pointer(element, 'pointermove', 115);
    await pointer(element, 'pointerup', 115);
    expect(initialResize.mock.calls).toEqual([[10]]);
    expect(nextResize.mock.calls).toEqual([[5]]);
    expect(initialEnd).not.toHaveBeenCalled();
    expect(nextEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores events before a drag and supports an omitted end callback', async () => {
    const onResize = vi.fn();
    const element = await render(onResize);
    document.body.style.cursor = 'help';
    document.body.style.userSelect = 'text';
    await pointer(element, 'pointermove');
    await pointer(element, 'pointerup');
    await pointer(element, 'pointercancel');
    expect(onResize).not.toHaveBeenCalled();
    expect(element.setPointerCapture).not.toHaveBeenCalled();
    expect(element.className).toBe(className);
    expect(document.body.style.cursor).toBe('help');
    expect(document.body.style.userSelect).toBe('text');

    await pointer(element, 'pointerdown');
    await pointer(element, 'pointercancel');
    expect(element.className).toBe(className);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });
});
