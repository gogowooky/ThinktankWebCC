/**
 * LazyTextEditorMedia.tsx
 * Monaco は初期バンドルの約3分の2を占めるので、一覧の表示を待たせないよう別チャンクへ分ける。
 */

import { Suspense, forwardRef, lazy } from 'react';
import type { TextEditorMediaRef } from './TextEditorMedia';
import type { MediaProps } from './types';

const PRELOAD_TIMEOUT_MS = 2000;

const loadTextEditor = () => import('./TextEditorMedia');

const TextEditorMediaImpl = lazy(async () => ({ default: (await loadTextEditor()).TextEditorMedia }));

export const TextEditorMedia = forwardRef<TextEditorMediaRef, MediaProps>(function LazyTextEditorMedia(props, ref) {
  return (
    <Suspense fallback={<div className="working-area__loading">エディタ読み込み中…</div>}>
      <TextEditorMediaImpl ref={ref} {...props} />
    </Suspense>
  );
});

/** ほぼ必ず使うので、最初の描画が済んだら空き時間に読み始めて開くときの待ちをなくす。 */
export function preloadTextEditor(): void {
  const load = () => { void loadTextEditor(); };
  if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: PRELOAD_TIMEOUT_MS });
  else setTimeout(load, 0);
}
