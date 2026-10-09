/**
 * panelTheme.ts
 * パネルのテーマ色を CSS 変数に流し込む。
 *
 * ユーザーが設定するのは docs/DefaultColor.md の
 *   <Panel>.Theme.Color   … パネルの基礎色（リボン等）
 *   <Panel>.Theme.BgColor … コンテンツ表示部（一覧・チャット等の白地）の背景色
 * の2色だけ。ここが書き込む色は `--<panel>-base` / `--<panel>-content-bg` の2つで、
 * ホバー・境界線・淡い地色などの派生は index.css が color-mix() で組み立てる。
 * 派生の定義をCSS側に置くことで、色の関係を1箇所（index.css）で読めるようにしている。
 *
 * リボン上の文字色だけは color-mix() では作れない（地の明るさで白黒を選ぶ必要がある）ため、
 * ここで判定して `--<panel>-on-ribbon-rgb` / `--<panel>-on-ribbon-soft-rgb` に書き込む。
 *
 * パネル間ボーダー（スプリッター）のマウスオーバー／ドラッグ中の色だけは
 * どのパネルにも属さないため FocusingBorder.Theme.Color として別に持ち、
 * `--focusing-border` へ流し込む。
 */

import { getDefaultColorStyle, isUnset } from './defaultColor';
import type { ColorStyle } from './defaultColor';

export type PanelThemeKind = 'Thinktank' | 'Seeds' | 'Discuss' | 'Harvest' | 'ToolBar';

export const PANEL_THEME_KINDS: PanelThemeKind[] = [
  'Thinktank', 'Seeds', 'Discuss', 'Harvest', 'ToolBar',
];

/** CSS変数の接頭辞 */
const CSS_PREFIX: Record<PanelThemeKind, string> = {
  Thinktank: 'thinktank',
  Seeds:  'seeds',
  Discuss:   'discuss',
  Harvest:   'harvest',
  ToolBar:   'toolbar',
};

/** <Panel>.Theme の StatusID */
export function panelThemeStatusId(kind: PanelThemeKind): string {
  return `${kind}.Theme`;
}

/** パネル間ボーダーのマウスオーバー／ドラッグ中の色を持つ StatusID */
export const FOCUSING_BORDER_STATUS_ID = 'FocusingBorder.Theme';

/** applyPanelThemeCss を呼び直すべき StatusID変数のワイルドカード一覧 */
export const THEME_STATUS_KEYS: string[] = [
  ...PANEL_THEME_KINDS.map(kind => `${panelThemeStatusId(kind)}.*`),
  `${FOCUSING_BORDER_STATUS_ID}.*`,
];

/** テーマ適用中だけトランジションを止めるクラス（index.css で定義） */
const SWITCHING_CLASS = 'tt-theme-switching';

/**
 * 全パネルのテーマ色を :root へ適用する。
 * 無設定（undefined）の項目は index.css の既定値に任せるため、変数を消す。
 *
 * 適用の前後でトランジションを一時的に切る。`transition: background` が効いている要素は
 * 変数だけが変わっても古い色のまま固まってしまう（再描画されるまで追従しない）ため。
 */
export function applyPanelThemeCss(store: Record<string, ColorStyle> | undefined): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.classList.add(SWITCHING_CLASS);

  for (const kind of PANEL_THEME_KINDS) {
    const statusId = panelThemeStatusId(kind);
    const theme: ColorStyle = store?.[statusId] ?? getDefaultColorStyle(statusId);
    const prefix = CSS_PREFIX[kind];

    setVar(root, `--${prefix}-base`,       theme.Color);
    setVar(root, `--${prefix}-content-bg`, theme.BgColor);

    // ToolBar の文字色は BgColor で明示指定する設計なので自動判定しない
    if (kind === 'ToolBar') continue;
    const text = ribbonTextRgb(theme);
    setVar(root, `--${prefix}-on-ribbon-rgb`,      text?.ribbon ?? '');
    setVar(root, `--${prefix}-on-ribbon-soft-rgb`, text?.soft ?? '');
  }

  const focusing: ColorStyle =
    store?.[FOCUSING_BORDER_STATUS_ID] ?? getDefaultColorStyle(FOCUSING_BORDER_STATUS_ID);
  setVar(root, '--focusing-border', focusing.Color);

  // 新しい色で1フレーム描かせてからトランジションを戻す
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
  });
}

// ── リボン上の文字色の自動判定 ───────────────────────────────────────────────

const WHITE_RGB = '255 255 255';
const BLACK_RGB = '0 0 0';
/** index.css の --<panel>-ribbon-soft と同じ配合（基礎色 80% ＋ 背景色） */
const RIBBON_SOFT_RATIO = 0.8;
/**
 * 白文字で読める限りは白を使う閾値（WCAG のUI部品・大きな文字の基準）。
 * 4.5 にすると既定テーマのメニューリボン（基礎色を淡くした地）まで黒文字に変わってしまう。
 */
const MIN_WHITE_CONTRAST = 3;

type Rgb = [number, number, number];

/** '#rgb' / '#rgba' / '#rrggbb' / '#rrggbbaa' を RGB に変換する（アルファは無視） */
export function parseHexColor(value: string): Rgb | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3 || h.length === 4) {
    return [0, 1, 2].map(i => parseInt(h[i] + h[i], 16)) as Rgb;
  }
  if (h.length === 6 || h.length === 8) {
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  return null;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 背景色に重ねる文字色（白か黒）を CSS の rgb() に渡す "R G B" 形式で返す */
export function readableTextRgb(bg: Rgb): string {
  const l = relativeLuminance(bg);
  const whiteContrast = 1.05 / (l + 0.05);
  const blackContrast = (l + 0.05) / 0.05;
  return whiteContrast >= MIN_WHITE_CONTRAST || whiteContrast >= blackContrast ? WHITE_RGB : BLACK_RGB;
}

/**
 * リボン（基礎色そのもの）と淡いリボン（ribbon-soft）それぞれの文字色。
 * 基礎色が無設定・解釈不能なら null を返し、index.css の既定（白）に任せる。
 */
export function ribbonTextRgb(theme: ColorStyle): { ribbon: string; soft: string } | null {
  const base = isUnset(theme.Color) ? null : parseHexColor(theme.Color);
  if (!base) return null;
  const contentBg = (!isUnset(theme.BgColor) && parseHexColor(theme.BgColor)) || [255, 255, 255] as Rgb;
  const soft = base.map((c, i) => c * RIBBON_SOFT_RATIO + contentBg[i] * (1 - RIBBON_SOFT_RATIO)) as Rgb;
  return { ribbon: readableTextRgb(base), soft: readableTextRgb(soft) };
}

function setVar(root: HTMLElement, name: string, value: string): void {
  if (isUnset(value)) root.style.removeProperty(name);
  else                root.style.setProperty(name, value);
}
