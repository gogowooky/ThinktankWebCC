/**
 * panelTheme.ts
 * パネルのテーマ色を CSS 変数に流し込む。
 *
 * ユーザーが設定するのは docs/DefaultColor.md の
 *   <Panel>.Theme.Color   … パネルの基礎色（リボン等）
 *   <Panel>.Theme.BgColor … コンテンツ表示部（一覧・チャット等の白地）の背景色
 * の2色だけ。ここが書き込むのも `--<panel>-base` / `--<panel>-content-bg` の2つだけで、
 * ホバー・境界線・淡い地色などの派生は index.css が color-mix() で組み立てる。
 * 派生の定義をCSS側に置くことで、色の関係を1箇所（index.css）で読めるようにしている。
 */

import { getDefaultColorStyle, isUnset } from './defaultColor';
import type { ColorStyle } from './defaultColor';

export type PanelThemeKind = 'Thinktank' | 'Overview' | 'Workout' | 'ReThink' | 'ToolBar';

export const PANEL_THEME_KINDS: PanelThemeKind[] = [
  'Thinktank', 'Overview', 'Workout', 'ReThink', 'ToolBar',
];

/** CSS変数の接頭辞 */
const CSS_PREFIX: Record<PanelThemeKind, string> = {
  Thinktank: 'thinktank',
  Overview:  'overview',
  Workout:   'workout',
  ReThink:   'rethink',
  ToolBar:   'toolbar',
};

/** <Panel>.Theme の StatusID */
export function panelThemeStatusId(kind: PanelThemeKind): string {
  return `${kind}.Theme`;
}

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
  }

  // 新しい色で1フレーム描かせてからトランジションを戻す
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
  });
}

function setVar(root: HTMLElement, name: string, value: string): void {
  if (isUnset(value)) root.style.removeProperty(name);
  else                root.style.setProperty(name, value);
}
