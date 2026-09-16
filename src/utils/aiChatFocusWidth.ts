/**
 * aiChatFocusWidth.ts
 * 親パネルにフォーカスがあり、かつそのパネルの AIChat が開いている間だけ、
 * パネルを一時的に広げるための幅計算。
 *
 * 「どの列にフォーカスがあるか」は App.tsx が body[data-focus-column] に書き出す既存の
 * 追跡をそのまま読む（getFocusName の列名）。ウィンドウがフォーカスを失ったときの解除も
 * そちらが面倒を見ているので、判定を二重に持たない。
 *
 * Workout の AIChat は設定パネル側にあるので列は WorkoutSetting。Pane 側は別列（Workout）
 * なので、AIChat Pane にフォーカスしてもここには一致せず、対象外になる。
 *
 * 元の幅は各パネルの state に残したままなので、条件を外れればそのまま元に戻る。
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { isIPhone } from './deviceInfo';

export type AiChatPanel = 'Thinktank' | 'Overview' | 'Workout' | 'ReThink';

/** パネルと body[data-focus-column] の列名の対応（getFocusName の戻り値の先頭部分）。 */
const FOCUS_COLUMN: Record<AiChatPanel, string> = {
  Thinktank: 'Thinktank',
  Overview:  'Overview',
  Workout:   'WorkoutSetting',
  ReThink:   'ReThink',
};

/** 縦タブバー(40px) + Splitter(3px)。PanelArea の幅はこれらを除いた内側の幅なので、
 *  パネル全体をアプリ幅の割合に合わせるにはこの分を差し引く。 */
const PANEL_CHROME = 43;

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (!observer) {
    observer = new MutationObserver(() => { for (const l of listeners) l(); });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-focus-column'] });
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; }
  };
}

function focusedColumn(): string {
  return document.body?.dataset.focusColumn ?? '';
}

/**
 * このパネルに適用する幅。親パネルにフォーカスがあり chatOpen の間だけ、
 * iPhone はアプリ全幅、それ以外はアプリの半分まで広げる。
 * 既に利用者がそれより広げている場合は縮めない（広げる操作なので Math.max）。
 *
 * @param chatOpen AIChat が開いているか（Area が開いていて表示が chat）
 */
export function useAiChatPanelWidth(panel: AiChatPanel, width: number, chatOpen: boolean): number {
  const column = useSyncExternalStore(subscribe, focusedColumn, () => '');
  const active = chatOpen && column === FOCUS_COLUMN[panel];
  const [appWidth, setAppWidth] = useState(0);

  // 広げている間だけ幅を追う。ウィンドウサイズが変われば割合を取り直す。
  useEffect(() => {
    if (!active) { setAppWidth(0); return; }
    const update = () => setAppWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [active]);

  if (!active || !appWidth) return width;
  return Math.max(width, Math.round(appWidth * (isIPhone() ? 1 : 0.5)) - PANEL_CHROME);
}
