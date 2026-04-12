/**
 * ColorTheme.ts
 * カラーモード定義と適用ロジック
 */

// カラーテーマ定義
export interface ColorTheme {
    name: string;
    // 基本色
    baseColor: string;
    // パネルタイトル
    titleBackground: string;
    titleForeground: string;
    // エディタ
    editorBackground: string;
    editorForeground: string;
    keywordBackground: string;
    // カーソル行
    cursorLineInactive: string;
    cursorLineActive1: string;
    cursorLineActive2: string;
    cursorLineActive3: string;
    // テーブル
    columnHeaderBackground: string;
    columnHeaderForeground: string;
    listItemBackground: string;
    listItemSelected: string;
    // ボーダー
    borderColor: string;
    // スプリッタートリガー
    splitterTrigger: string;
}

// DefaultDark - 現在のダークテーマ
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

// DefaultOriginal - Style.xamlのラベンダー系ライトテーマ
export const DefaultOriginal: ColorTheme = {
    name: 'DefaultOriginal',
    baseColor: '#E6E6FA',           // ラベンダー
    titleBackground: '#6A5ACD',      // スレートブルー
    titleForeground: '#FFFFFF',
    editorBackground: '#FFFFFF',
    editorForeground: '#483D8B',     // ダークスレートブルー
    keywordBackground: '#FFF0F0',
    cursorLineInactive: '#E6E6FA',
    cursorLineActive1: '#F5E0F0',
    cursorLineActive2: '#D5E0FF',
    cursorLineActive3: '#F4F4E0',
    columnHeaderBackground: '#7B68EE', // ミディアムスレートブルー
    columnHeaderForeground: '#FFFFFF',
    listItemBackground: '#EAEAFF',
    listItemSelected: '#C6C6FA',
    borderColor: '#B0B0D8',
    splitterTrigger: '#32CD32',
};

// テーママップ
export const colorThemes: Record<string, ColorTheme> = {
    'DefaultDark': DefaultDark,
    'DefaultOriginal': DefaultOriginal,
};

// 現在のテーマ
let currentTheme: ColorTheme = DefaultDark;

/**
 * カラーモードを適用
 */
export function applyColorMode(modeName: string): void {
    const theme = colorThemes[modeName];
    if (!theme) {
        console.warn(`Unknown color mode: ${modeName}`);
        return;
    }

    currentTheme = theme;
    console.log(`Applying color mode: ${modeName}`);

    // CSS変数として適用
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

    // Monaco Editorのテーマも切り替え（DefaultDark: 'my-dark', DefaultOriginal: 'vs'）
    const monacoTheme = modeName === 'DefaultOriginal' ? 'vs' : 'my-dark';
    root.dataset.monacoTheme = monacoTheme;
}

/**
 * 現在のテーマを取得
 */
export function getCurrentTheme(): ColorTheme {
    return currentTheme;
}

// ════════════════════════════════════════════════════════════════════════════════
// キーワードハイライト用6色スタイル定義
// ════════════════════════════════════════════════════════════════════════════════

/**
 * 個別キーワードのスタイル定義
 */
export interface KeywordStyle {
    foreground: string;
    background: string;
    fontWeight: 'normal' | 'bold';
    underline: boolean;
}

/**
 * 6色キーワードスタイルセット
 */
export interface KeywordColorMode {
    name: string;
    Keyword1: KeywordStyle;
    Keyword2: KeywordStyle;
    Keyword3: KeywordStyle;
    Keyword4: KeywordStyle;
    Keyword5: KeywordStyle;
    Keyword6: KeywordStyle;
}

// Default - EditorRule.xshdに基づく標準スタイル
export const KeywordColorModeDefault: KeywordColorMode = {
    name: 'Default',
    Keyword1: { foreground: '#000000', background: '#FF99FF', fontWeight: 'bold', underline: false },
    Keyword2: { foreground: '#000000', background: '#99FF99', fontWeight: 'bold', underline: false },
    Keyword3: { foreground: '#000000', background: '#FFFF99', fontWeight: 'bold', underline: false },
    Keyword4: { foreground: '#000000', background: '#99FFFF', fontWeight: 'bold', underline: false },
    Keyword5: { foreground: '#000000', background: '#FFCC99', fontWeight: 'bold', underline: false },
    Keyword6: { foreground: '#000000', background: '#FF9999', fontWeight: 'bold', underline: false },
};

// Subtle - 控えめなスタイル（下線なし）
export const KeywordColorModeSubtle: KeywordColorMode = {
    name: 'Subtle',
    Keyword1: { foreground: '#CC2222', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword2: { foreground: '#229922', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword3: { foreground: '#6666CC', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword4: { foreground: '#0088FF', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword5: { foreground: '#AA66AA', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword6: { foreground: '#666666', background: 'transparent', fontWeight: 'normal', underline: false },
};

// None - ハイライトなし
export const KeywordColorModeNone: KeywordColorMode = {
    name: 'None',
    Keyword1: { foreground: 'inherit', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword2: { foreground: 'inherit', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword3: { foreground: 'inherit', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword4: { foreground: 'inherit', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword5: { foreground: 'inherit', background: 'transparent', fontWeight: 'normal', underline: false },
    Keyword6: { foreground: 'inherit', background: 'transparent', fontWeight: 'normal', underline: false },
};

// キーワードカラーモードマップ
export const keywordColorModes: Record<string, KeywordColorMode> = {
    'Default': KeywordColorModeDefault,
    'Subtle': KeywordColorModeSubtle,
    'None': KeywordColorModeNone,
};

/**
 * キーワードカラーモードを取得
 */
export function getKeywordColorMode(modeName: string): KeywordColorMode {
    return keywordColorModes[modeName] || KeywordColorModeDefault;
}

/**
 * 指定されたキーワード番号(1-6)のスタイルを取得
 */
export function getKeywordStyle(modeName: string, keywordNumber: 1 | 2 | 3 | 4 | 5 | 6): KeywordStyle {
    const mode = getKeywordColorMode(modeName);
    return mode[`Keyword${keywordNumber}`];
}

