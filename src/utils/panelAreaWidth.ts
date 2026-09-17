/**
 * panelAreaWidth.ts
 * 各パネルの Area 表示幅（<Panel>Panel.Area.OpenWidth）の値と、その解決。
 *
 * Status が持つのは幅の px ではなく「どの幅を使うか」のモード：
 *   init    … 起動時の値（パネルごとの既定幅）
 *   user    … アプリ使用中にユーザーが Splitter で設定した値
 *   foredit … iPhone はアプリ幅の100%、その他はアプリ幅の50%（縦タブバー・Splitter を含めた幅）
 *
 * px の実体はモードから毎回導出する。user 幅はパネルモデルが保持し、
 * foredit 幅はアプリ幅から計算するのでウィンドウサイズに追従する。
 */

import { useEffect, useState } from 'react';
import { isIPhone } from './deviceInfo';

export type AreaWidthMode = 'init' | 'user' | 'foredit';

/** Status の candidates と揃える（next/prev の循環順もこの順） */
export const AREA_WIDTH_MODES: readonly AreaWidthMode[] = ['init', 'user', 'foredit'];

export function isAreaWidthMode(v: string): v is AreaWidthMode {
  return (AREA_WIDTH_MODES as readonly string[]).includes(v);
}

/**
 * パネルごとの起動時の幅（init）。
 * AppLayout / WorkoutPanel の両方が参照するので、値の持ち場はここ1箇所にする。
 */
export const INIT_AREA_WIDTH = {
  Thinktank: 280,
  Overview:  280,
  Workout:   220,
  ReThink:   320,
} as const;

/** パネル幅の下限（Splitter 操作時の clamp に使う） */
export const MIN_AREA_WIDTH = 120;

/**
 * パネル1列のうち Area 以外が占める幅：縦タブバー(40px) + Splitter(3px)。
 * foredit の割合はタブバーを含めたパネル全体に対するものなので、Area の幅からこの分を引く。
 */
export const PANEL_CHROME_WIDTH = 43;

/**
 * foredit の幅（Area に指定する px）。
 * タブバー・Splitter を含めたパネル全体が、iPhone はアプリ幅の100%、その他は50%になる。
 */
export function forEditAreaWidth(appWidth: number): number {
  const panelWidth = Math.round(appWidth * (isIPhone() ? 1 : 0.5));
  return Math.max(MIN_AREA_WIDTH, panelWidth - PANEL_CHROME_WIDTH);
}

/**
 * モードから実際の表示幅(px)を返す。
 * foredit の間だけウィンドウ幅の変化を購読し、割合を取り直す。
 */
export function useResolvedAreaWidth(mode: AreaWidthMode, initWidth: number, userWidth: number): number {
  const [appWidth, setAppWidth] = useState(0);

  useEffect(() => {
    if (mode !== 'foredit') { setAppWidth(0); return; }
    const update = () => setAppWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [mode]);

  // foredit でアプリ幅の取得前（初回レンダー）は、ちらつかせずに user 幅を出しておく
  if (mode === 'foredit') return appWidth ? forEditAreaWidth(appWidth) : userWidth;
  return mode === 'user' ? userWidth : initWidth;
}
