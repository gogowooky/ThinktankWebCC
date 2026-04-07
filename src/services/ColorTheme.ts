/**
 * ColorTheme.ts
 * カラーテーマ定義とCSS変数適用
 * reference2/src/services/ColorTheme.ts ベース
 */

export interface ColorTheme {
  name: string;
  baseColor: string;
  titleBackground: string;
  titleForeground: string;
  editorBackground: string;
  editorForeground: string;
  keywordBackground: string;
  cursorLineInactive: string;
  cursorLineActive1: string;
  cursorLineActive2: string;
  cursorLineActive3: string;
  columnHeaderBackground: string;
  columnHeaderForeground: string;
  listItemBackground: string;
  listItemSelected: string;
  borderColor: string;
  splitterTrigger: string;
}

// DefaultDark - ダークテーマ（reference2準拠）
export const DefaultDark: ColorTheme = {
  name: 'DefaultDark',
  baseColor: '#2b2b2b',
  titleBackground: '#3c3c3c',
  titleForeground: '#cccccc',
  editorBackground: '#1e1e1e',
  editorForeground: '#d4d4d4',
  keywordBackground: '#2b2b2b',
  cursorLineInactive: '#2d2d2d',
  cursorLineActive1: '#3a3a3a',
  cursorLineActive2: '#2d3a4a',
  cursorLineActive3: '#3a3a2d',
  columnHeaderBackground: '#252526',
  columnHeaderForeground: '#aaaaaa',
  listItemBackground: '#2b2b2b',
  listItemSelected: '#264f78',
  borderColor: '#444444',
  splitterTrigger: '#32CD32',
};

const colorThemes: Record<string, ColorTheme> = {
  DefaultDark,
};

let currentTheme: ColorTheme = DefaultDark;

/**
 * カラーモードを適用してCSS変数をセット
 */
export function applyColorMode(modeName: string): void {
  const theme = colorThemes[modeName];
  if (!theme) return;
  currentTheme = theme;

  const root = document.documentElement;
  root.style.setProperty('--tt-base-color', theme.baseColor);
  root.style.setProperty('--tt-title-bg', theme.titleBackground);
  root.style.setProperty('--tt-title-fg', theme.titleForeground);
  root.style.setProperty('--tt-editor-bg', theme.editorBackground);
  root.style.setProperty('--tt-editor-fg', theme.editorForeground);
  root.style.setProperty('--tt-keyword-bg', theme.keywordBackground);
  root.style.setProperty('--tt-cursor-line-inactive', theme.cursorLineInactive);
  root.style.setProperty('--tt-cursor-line-active1', theme.cursorLineActive1);
  root.style.setProperty('--tt-cursor-line-active2', theme.cursorLineActive2);
  root.style.setProperty('--tt-cursor-line-active3', theme.cursorLineActive3);
  root.style.setProperty('--tt-column-header-bg', theme.columnHeaderBackground);
  root.style.setProperty('--tt-column-header-fg', theme.columnHeaderForeground);
  root.style.setProperty('--tt-list-item-bg', theme.listItemBackground);
  root.style.setProperty('--tt-list-item-selected', theme.listItemSelected);
  root.style.setProperty('--tt-border-color', theme.borderColor);
  root.style.setProperty('--tt-splitter-trigger', theme.splitterTrigger);
  root.dataset.colorMode = modeName;
}

/**
 * 現在のテーマを取得
 */
export function getCurrentTheme(): ColorTheme {
  return currentTheme;
}
