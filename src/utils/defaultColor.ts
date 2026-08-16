/**
 * defaultColor.ts
 * docs/DefaultColor.md をアプリの色設定の唯一の定義元として読み込む。
 *
 * 書式:
 *   - `#` / `;` / `>` で始まる行はコメント（行頭の空白は無視して判定する）
 *   - CSV 1行 = `StatusID名, Color値, BgColor値, Attrs値`
 *   - `undefined` は無設定値
 *
 * 1行から `<StatusID>.Color` / `<StatusID>.BgColor` / `<StatusID>.Attrs` の
 * 3つの StatusID変数が生まれ、CSVの各値がその既定値になる（登録は TTUIStateManager）。
 */

import defaultColorContent from '../../docs/DefaultColor.md?raw';

/** 無設定を表す値。DefaultColor.md 上の `undefined` に対応する */
export const UNSET = 'undefined';

export type ColorProp = 'Color' | 'BgColor' | 'Attrs';

export const COLOR_PROPS: ColorProp[] = ['Color', 'BgColor', 'Attrs'];

export type ColorStyle = Record<ColorProp, string>;

export interface DefaultColorEntry {
  statusId: string;
  style:    ColorStyle;
}

/** 値が未設定（無指定）かどうか。`none` は既存設定値の互換表記として同じ扱いにする */
export function isUnset(value: string | undefined | null): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === '' || v === UNSET || v === 'none';
}

/** docs/DefaultColor.md 形式のテキストをパースする */
export function parseDefaultColor(text: string): DefaultColorEntry[] {
  const entries: DefaultColorEntry[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[#;>]/.test(line)) continue;

    const parts = line.split(',').map(s => s.trim());
    const statusId = parts[0];
    if (!statusId) continue;

    entries.push({
      statusId,
      style: {
        Color:   parts[1] || UNSET,
        BgColor: parts[2] || UNSET,
        Attrs:   parts[3] || UNSET,
      },
    });
  }
  return entries;
}

/** docs/DefaultColor.md の全エントリ（記述順） */
export const DEFAULT_COLOR_ENTRIES: DefaultColorEntry[] = parseDefaultColor(defaultColorContent);

const DEFAULT_COLOR_MAP: Record<string, ColorStyle> = Object.fromEntries(
  DEFAULT_COLOR_ENTRIES.map(e => [e.statusId, e.style]),
);

/** StatusID の既定スタイルを複製して返す。未定義のIDは全て無設定 */
export function getDefaultColorStyle(statusId: string): ColorStyle {
  const style = DEFAULT_COLOR_MAP[statusId];
  return style ? { ...style } : { Color: UNSET, BgColor: UNSET, Attrs: UNSET };
}

/**
 * StatusID変数1つぶんの既定値を返す。
 * DefaultColor.md に行がない（コメントアウト等）か無設定の場合は fallback を使う。
 * 既存の設定値（TextEditorSettings 等）の初期値を DefaultColor.md 側へ寄せるために使う。
 */
export function defaultColorValue(statusId: string, prop: ColorProp, fallback: string): string {
  const value = DEFAULT_COLOR_MAP[statusId]?.[prop];
  return value && !isUnset(value) ? value : fallback;
}

/** 全 StatusID の既定スタイルを複製した実行時ストアを作る */
export function createColorStatusDefaults(): Record<string, ColorStyle> {
  return Object.fromEntries(DEFAULT_COLOR_ENTRIES.map(e => [e.statusId, { ...e.style }]));
}

/** Attrs値（`bold|underline` 形式）を属性名の集合に分解する */
export function parseAttrs(attrs: string | undefined): Set<string> {
  if (isUnset(attrs)) return new Set();
  return new Set(
    attrs!.split('|').map(a => a.trim().toLowerCase()).filter(a => a && a !== UNSET),
  );
}

/**
 * ColorStyle を CSS 宣言列に変換する。
 * Monaco のトークン色より後勝ちにする必要があるため !important を付ける
 * （既存の見出し・ハイライト系デコレーションと同じ方針）。
 */
export function colorStyleToCss(style: ColorStyle): string {
  const decls: string[] = [];
  if (!isUnset(style.Color))   decls.push(`color: ${style.Color} !important;`);
  if (!isUnset(style.BgColor)) decls.push(`background-color: ${style.BgColor} !important;`);

  const attrs = parseAttrs(style.Attrs);
  if (attrs.has('bold'))   decls.push('font-weight: bold !important;');
  if (attrs.has('italic')) decls.push('font-style: italic !important;');

  const decoration: string[] = [];
  if (attrs.has('underline'))     decoration.push('underline');
  if (attrs.has('strikethrough')) decoration.push('line-through');
  if (decoration.length > 0) decls.push(`text-decoration: ${decoration.join(' ')} !important;`);

  return decls.join(' ');
}

/**
 * ColorStyle を style 属性用のオブジェクトに変換する。
 * 注入済みCSSクラスが使えない場所（DataGrid のセル等）で使う。
 */
export function colorStyleToInlineStyle(style: ColorStyle | undefined): Record<string, string> {
  const css: Record<string, string> = {};
  if (!style) return css;
  if (!isUnset(style.Color))   css.color = style.Color;
  if (!isUnset(style.BgColor)) css.backgroundColor = style.BgColor;

  const attrs = parseAttrs(style.Attrs);
  if (attrs.has('bold'))   css.fontWeight = 'bold';
  if (attrs.has('italic')) css.fontStyle = 'italic';

  const decoration: string[] = [];
  if (attrs.has('underline'))     decoration.push('underline');
  if (attrs.has('strikethrough')) decoration.push('line-through');
  if (decoration.length > 0) css.textDecoration = decoration.join(' ');

  return css;
}

// ── 番号付きスタイル（Bullet / Comment / Heading / Highlighter）──────────────
//
// いずれも docs/DefaultColor.md の TextEditor.<種別>.Style(1..N).* が色・表示属性を持つ。
// Bullet / Comment は行頭記号を TextEditor.<種別>.Marks（CSV）に別途持ち、
// その n 番目のアイテムが StyleN に対応する。
// Heading は見出しレベル、Highlighter はハイライトグループ番号が n になる。

export type StyleKind = 'Bullet' | 'Comment' | 'Heading' | 'Highlighter';

/** 行頭記号を持つ種別（記号は Marks 側、色は StyleN 側） */
export type MarkKind = 'Bullet' | 'Comment';

/** 番号で引く種別と、その登録数 */
export const INDEXED_STYLE_COUNT: Record<'Heading' | 'Highlighter', number> = {
  Heading:     6,
  Highlighter: 6,
};

/** TextEditor.<種別>.Marks の既定値 */
export const DEFAULT_MARKS: Record<MarkKind, string> = {
  Bullet:  '・,-,*,■,●,=,↓,→,[✓]',
  Comment: '>,>>,>>>,;,|,//',
};

/** Marks（CSV）を行頭記号の配列に分解する。空アイテムは登録なしとして捨てる */
export function parseMarks(marks: string | undefined): string[] {
  if (!marks) return [];
  return marks.split(',').map(m => m.trim()).filter(Boolean);
}

/** n 番目（1始まり）のスタイルの StatusID */
export function styleStatusId(kind: StyleKind, index: number): string {
  return `TextEditor.${kind}.Style${index}`;
}

/** n 番目（1始まり）のデコレーションのCSSクラス名 */
export function styleClass(kind: StyleKind, index: number): string {
  switch (kind) {
    case 'Bullet':      return `custom-bullet-b${index}`;
    case 'Comment':     return `custom-comment-c${index}`;
    case 'Heading':     return `custom-heading-${index}`;
    case 'Highlighter': return `custom-highlight-g${index}`;
  }
}

/** ColorStatus ストアから n 番目のスタイルを取り出す */
export function pickStyle(
  kind: StyleKind,
  index: number,
  store: Record<string, ColorStyle> | undefined,
): ColorStyle {
  const statusId = styleStatusId(kind, index);
  return store?.[statusId] ?? getDefaultColorStyle(statusId);
}

/** Heading / Highlighter のスタイル一覧（配列の添字0が Style1）*/
export function pickIndexedStyles(
  kind: 'Heading' | 'Highlighter',
  store: Record<string, ColorStyle> | undefined,
): ColorStyle[] {
  return Array.from({ length: INDEXED_STYLE_COUNT[kind] }, (_, i) => pickStyle(kind, i + 1, store));
}

export interface MarkStyle {
  /** 行頭記号（TextEditor.<種別>.Marks の n 番目） */
  mark:  string;
  /** 色・表示属性（docs/DefaultColor.md の TextEditor.<種別>.StyleN.*） */
  style: ColorStyle;
}

/** Marks と ColorStatus ストアから行頭記号スタイル一覧を組み立てる */
export function pickMarkStyles(
  kind: MarkKind,
  marks: string | undefined,
  store: Record<string, ColorStyle> | undefined,
): MarkStyle[] {
  return parseMarks(marks).map((mark, i) => ({ mark, style: pickStyle(kind, i + 1, store) }));
}

/** Attrs 値（`bold|underline` 形式）に属性を足す/外した新しい値を返す */
export function toggleAttr(attrs: string | undefined, attr: string, on: boolean): string {
  const set = parseAttrs(attrs);
  if (on) set.add(attr); else set.delete(attr);
  return set.size > 0 ? [...set].join('|') : UNSET;
}

// ── TextEditor の Url / Filepath / Tag スタイル ─────────────────────────────

export type LinkStyleName = 'url' | 'filepath' | 'tag';

/** TextEditor.CurrentEditor.DoOnCursorPos が認識する要素と、その表示属性を持つ StatusID */
export const LINK_STYLE_STATUS_IDS: Record<LinkStyleName, string> = {
  url:      'TextEditor.Url.Style',
  filepath: 'TextEditor.Filepath.Style',
  tag:      'TextEditor.Tag.Style',
};

export type LinkStyles = Record<LinkStyleName, ColorStyle>;

/** Url / Filepath / Tag デコレーションのCSSクラス名 */
export function linkStyleClass(name: LinkStyleName): string {
  return `custom-${name}-style`;
}

/** ColorStatus ストアから Url / Filepath / Tag のスタイルを取り出す */
export function pickLinkStyles(store: Record<string, ColorStyle> | undefined): LinkStyles {
  const result = {} as LinkStyles;
  for (const name of Object.keys(LINK_STYLE_STATUS_IDS) as LinkStyleName[]) {
    const statusId = LINK_STYLE_STATUS_IDS[name];
    result[name] = store?.[statusId] ?? getDefaultColorStyle(statusId);
  }
  return result;
}

// ── TextEditor のインライン書式 ────────────────────────────────────────────

export type InlineStyleName = 'bold' | 'italic' | 'underline' | 'strikethrough';

/**
 * TextEditor 上の書式記法と、その表示属性を持つ StatusID の対応。
 * 配列順 = 判定順。`**bold**` を `*italic*` より先に判定しないと
 * `**` の片側が斜体の開始記号として食われるため、この順序を崩さないこと
 * （判定済みの記号は marker 長ぶん伏せ字にして次のルールへ渡す）。
 */
export const INLINE_STYLE_RULES: {
  name: InlineStyleName;
  statusId: string;
  /** 開始・終了の記号。判定済み範囲を伏せ字にする長さに使う */
  marker: string;
  pattern: string;
}[] = [
  { name: 'bold',          statusId: 'TextEditor.Bold',          marker: '**', pattern: '\\*\\*(.+?)\\*\\*' },
  { name: 'underline',     statusId: 'TextEditor.Underline',     marker: '__', pattern: '__(.+?)__' },
  { name: 'strikethrough', statusId: 'TextEditor.Strikethrough', marker: '~~', pattern: '~~(.+?)~~' },
  { name: 'italic',        statusId: 'TextEditor.Italic',        marker: '*',  pattern: '\\*(.+?)\\*' },
];

/** 判定済みの記号を隠すための伏せ字。テキストに現れない制御文字を使う */
export const INLINE_MASK_CHAR = '\u0000';

export type InlineStyles = Record<InlineStyleName, ColorStyle>;

/** インライン書式に付けるCSSクラス名。TextEditor（Monaco）と Markdown 表示で共通 */
export function inlineStyleClass(name: InlineStyleName): string {
  return `custom-inline-${name}`;
}

const INLINE_STYLE_ELEMENT_ID = 'tt-inline-styles';

/**
 * インライン書式のCSSを document.head に注入する（TextEditor / Markdown 共通）。
 *
 * 素の <strong> / <em> / <del> は太字・斜体・打消しを自前で持つため、
 * DefaultColor.md の指定だけが効くよう最初に打ち消してから設定値を当てる。
 */
export function injectInlineStyleCss(styles: InlineStyles | undefined): void {
  if (typeof document === 'undefined') return;

  let el = document.getElementById(INLINE_STYLE_ELEMENT_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = INLINE_STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  if (!styles) { el.textContent = ''; return; }

  const reset = INLINE_STYLE_RULES.map(r => `.${inlineStyleClass(r.name)}`).join(', ')
    + ' { font-weight: inherit; font-style: inherit; text-decoration: none; }';

  const rules = INLINE_STYLE_RULES.map(rule => {
    const decls = colorStyleToCss(styles[rule.name]);
    if (!decls) return '';
    const cls = inlineStyleClass(rule.name);
    return `.${cls}, .${cls} * { ${decls} }`;
  }).filter(Boolean);

  el.textContent = [reset, ...rules].join('\n');
}

/** ColorStatus ストアから TextEditor のインライン書式スタイルを取り出す */
export function pickInlineStyles(store: Record<string, ColorStyle> | undefined): InlineStyles {
  const result = {} as InlineStyles;
  for (const rule of INLINE_STYLE_RULES) {
    result[rule.name] = store?.[rule.statusId] ?? getDefaultColorStyle(rule.statusId);
  }
  return result;
}
