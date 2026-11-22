// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useNativeDragCleanup } from './useNativeDragCleanup';

// WorkingPanel と同じ形: D&D 中だけ Pane の上にシールドを出し、drop はその親で受ける
function Harness({ onDrop }: { onDrop: () => void }) {
  const [isDragging, setIsDragging] = useState(true);
  useNativeDragCleanup(() => setIsDragging(false));
  return (
    <div className="body" onDrop={onDrop}>
      <div className="pane">{isDragging && <div className="shield" />}</div>
    </div>
  );
}

// ブラウザ由来のイベントでは、リスナーごとにマイクロタスクが処理され React が再描画する。
// window のキャプチャ段階の後始末の直後にそれが起きる状況を、後から登録したキャプチャで再現する
const flushLikeBrowser = () => flushSync(() => {});

// React は window.event の種類で更新の優先度を決める（drop なら即時）。jsdom には無いので補う
let currentEvent: Event | undefined;
const fire = (el: Element, type: string) => {
  currentEvent = new Event(type, { bubbles: true, cancelable: true });
  try { el.dispatchEvent(currentEvent); } finally { currentEvent = undefined; }
};

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.defineProperty(window, 'event', { configurable: true, get: () => currentEvent });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => {
  window.removeEventListener('drop', flushLikeBrowser, true);
  flushSync(() => root.unmount()); host.remove();
  Reflect.deleteProperty(window, 'event');
});

function mountDragging(onDrop: () => void): Element {
  flushSync(() => root.render(<Harness onDrop={onDrop} />));
  window.addEventListener('drop', flushLikeBrowser, true);
  fire(host.querySelector('.pane')!, 'dragover');
  const shield = host.querySelector('.shield');
  expect(shield).not.toBeNull();
  return shield!;
}

it('シールドへの drop が Pane 側のハンドラーに届き、その後ゴースト類が消える', async () => {
  const onDrop = vi.fn();
  const shield = mountDragging(onDrop);

  fire(shield, 'drop');
  expect(onDrop).toHaveBeenCalledTimes(1);

  await vi.waitFor(() => expect(host.querySelector('.shield')).toBeNull());
});

it('drop がパネルの外で止められても、ゴースト類は消える', async () => {
  const shield = mountDragging(() => {});
  const outside = document.createElement('div');
  outside.addEventListener('drop', e => e.stopPropagation());
  document.body.appendChild(outside);
  try {
    fire(outside, 'drop');
    await vi.waitFor(() => expect(shield.isConnected).toBe(false));
  } finally {
    outside.remove();
  }
});

it('dragend が届かなくても、D&D 後の最初の mousemove で消える', async () => {
  mountDragging(() => {});
  fire(document.body, 'mousemove');
  await vi.waitFor(() => expect(host.querySelector('.shield')).toBeNull());
});
