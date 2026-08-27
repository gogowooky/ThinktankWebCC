/**
 * appZoom.ts
 * 表示文字サイズの拡大 / 縮小（拡大表示 / 縮小表示アクション）。
 *
 * CSS の `zoom` はブラウザ／バージョンで挙動が割れる（legacy zoom と仕様化 zoom で
 * 要素の寸法・パーセント解決・reflow が変わる）ため使わない。
 * 代わりに <html> に CSS変数 `--tt-font-scale`（例 1.3）を設定し、
 * 全 CSS の font-size を `calc(Npx * var(--tt-font-scale, 1))` に統一している。
 * これにより「文字だけ」拡大／縮小し、余白・パネル幅・レイアウトは不変で再フローする。
 * calc() + var() は全ブラウザで同一挙動。
 *
 * Monaco エディタは CSS を継承しないため、TextEditorMedia 側で fontSize オプションに
 * この倍率を掛けて渡す（getAppFontScale / tt-font-scale-change イベント）。
 *
 * 倍率は localStorage に永続化する。
 */

const LS_KEY = 'tt-app-zoom';

/** 倍率変更時に window に投げるイベント名（Monaco 等、CSS で追随できない箇所向け）。 */
export const FONT_SCALE_EVENT = 'tt-font-scale-change';

export const ZOOM_MIN     = 50;
export const ZOOM_MAX     = 200;
export const ZOOM_STEP    = 10;
export const ZOOM_DEFAULT = 100;

function clamp(percent: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(percent)));
}

/** 現在の表示倍率（％）。未設定・不正値は 100 を返す。 */
export function getAppZoom(): number {
  try {
    const raw = parseInt(localStorage.getItem(LS_KEY) ?? '', 10);
    return Number.isFinite(raw) ? clamp(raw) : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

/** 現在の文字倍率（1.0 = 等倍）。Monaco など calc() を使えない箇所向け。 */
export function getAppFontScale(): number {
  return getAppZoom() / 100;
}

/** 倍率を <html> の --tt-font-scale へ反映する（永続化はしない）。引数省略時は保存値。 */
export function applyAppZoom(percent: number = getAppZoom()): void {
  if (typeof document === 'undefined') return;
  const scale = clamp(percent) / 100;
  if (scale === 1) {
    document.documentElement.style.removeProperty('--tt-font-scale');
  } else {
    document.documentElement.style.setProperty('--tt-font-scale', String(scale));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(FONT_SCALE_EVENT, { detail: scale }));
  }
}

/** 倍率を設定・永続化・反映し、確定した値（％）を返す。 */
export function setAppZoom(percent: number): number {
  const v = clamp(percent);
  try {
    localStorage.setItem(LS_KEY, String(v));
  } catch {
    // プライベートブラウズ等で localStorage が使えない場合は無視
  }
  applyAppZoom(v);
  return v;
}
