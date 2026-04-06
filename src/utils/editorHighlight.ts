/**
 * editorHighlight - Monaco Editor カスタムハイライト
 *
 * 1. 単語ハイライト: カーソル位置のワードを全箇所ハイライト
 *    - 全角区切り文字（。、！？・～「」等）でワード分割
 *    - 文字種の切り替わり（漢字↔カタカナ↔ひらがな↔ASCII）でワード分割
 *    - 括弧（「」『』（）【】）内のテキストもワード単位
 *
 * 2. キーワードハイライト: HighlighterKeyword入力に基づくハイライト
 *    - スペース区切り = 同じ色（同一グループ）
 *    - カンマ区切り = 異なる色（別グループ）
 *    - エディタ内とツールバーで同じ色を使用
 */

import type { editor } from 'monaco-editor';

// ═══════════════════════════════════════════════════════════════
// ハイライトカラー定義（エディタ内とツールバーで共通）
// ═══════════════════════════════════════════════════════════════

/** ハイライト色（エディタ内背景 + ツールバータグ背景に共通使用） */
export const KEYWORD_COLORS = [
  '#b8a000',   // yellow
  '#1a8a50',   // green
  '#2060c0',   // blue
  '#b83070',   // pink
  '#6030c0',   // purple
  '#b06010',   // orange
  '#108080',   // cyan
  '#902090',   // magenta
];

const WORD_HIGHLIGHT_BG = 'rgba(200, 200, 200, 0.22)';
const WORD_HIGHLIGHT_BORDER = '1px solid rgba(200, 200, 200, 0.35)';

// ═══════════════════════════════════════════════════════════════
// 文字種判定（ワード境界の決定に使用）
// ═══════════════════════════════════════════════════════════════

type CharType = 'kanji' | 'katakana' | 'hiragana' | 'ascii' | 'delimiter';

/** 全角区切り文字セット */
const FULLWIDTH_DELIMITERS = new Set([
  '。', '、', '！', '？', '・', '～', '…', '‥',
  '：', '；', '＝', '＋', '－', '＊', '／',
  '「', '」', '『', '』', '（', '）', '【', '】',
  '＜', '＞', '《', '》', '〈', '〉', '｛', '｝',
  '　', // 全角スペース
  '\u201C', '\u201D', '\u2018', '\u2019',  // " " ' '
  '―', '─', '–',
]);

function charType(ch: string): CharType {
  // 全角区切り文字を最優先で判定（カタカナ範囲の・等を正しくdelimiterにする）
  if (FULLWIDTH_DELIMITERS.has(ch)) return 'delimiter';

  const code = ch.charCodeAt(0);
  // 漢字: CJK Unified Ideographs + Extension A
  if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF)) return 'kanji';
  // カタカナ（長音符ー含む、ただし区切り文字は除外済み）
  if ((code >= 0x30A0 && code <= 0x30FF) || code === 0x30FC) return 'katakana';
  // ひらがな
  if (code >= 0x3040 && code <= 0x309F) return 'hiragana';
  // ASCII word char (a-z, A-Z, 0-9, _)
  if (/\w/.test(ch)) return 'ascii';
  return 'delimiter';
}

// ═══════════════════════════════════════════════════════════════
// カーソル位置のワード抽出
// ═══════════════════════════════════════════════════════════════

/** 開き括弧 → 閉じ括弧 マップ */
const BRACKET_PAIRS: Record<string, string> = {
  '「': '」', '『': '』', '（': '）', '【': '】',
  '(': ')', '[': ']', '＜': '＞', '《': '》',
};
const CLOSE_BRACKETS = new Set(Object.values(BRACKET_PAIRS));

export function extractWordAtCursor(
  model: editor.ITextModel,
  lineNumber: number,
  column: number,
): string | null {
  const lineContent = model.getLineContent(lineNumber);
  if (!lineContent) return null;

  // column は 1-based、idx は 0-based
  // カーソルは文字の「前」にあるので、カーソル左の文字を基準にする
  let idx = column - 2;
  if (idx < 0) idx = 0;
  if (idx >= lineContent.length) idx = lineContent.length - 1;
  if (idx < 0) return null;

  const ch = lineContent[idx];

  // 括弧内テキスト: カーソルが括弧内にいれば括弧内全体をワードとする
  const bracketWord = extractBracketContent(lineContent, idx);
  if (bracketWord) return bracketWord;

  // 区切り文字上ならワードなし
  const ct = charType(ch);
  if (ct === 'delimiter') return null;

  // 同一文字種の連続をワードとして抽出
  // 文字種が変わる位置がワード境界
  let start = idx;
  while (start > 0 && charType(lineContent[start - 1]) === ct) start--;
  let end = idx;
  while (end < lineContent.length - 1 && charType(lineContent[end + 1]) === ct) end++;

  const word = lineContent.slice(start, end + 1);
  return word.length >= 1 ? word : null;
}

function extractBracketContent(line: string, idx: number): string | null {
  for (let i = idx; i >= 0; i--) {
    const c = line[i];
    if (CLOSE_BRACKETS.has(c) && i < idx) return null;
    if (BRACKET_PAIRS[c]) {
      const closing = BRACKET_PAIRS[c];
      const closeIdx = line.indexOf(closing, i + 1);
      if (closeIdx > i && idx <= closeIdx) {
        const inner = line.slice(i + 1, closeIdx);
        return inner.length > 0 ? inner : null;
      }
      return null;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// テキスト内の全出現箇所を検索
// ═══════════════════════════════════════════════════════════════

interface Range {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

function findAllOccurrences(model: editor.ITextModel, searchText: string): Range[] {
  if (!searchText) return [];
  const results: Range[] = [];
  const searchLower = searchText.toLowerCase();
  const lineCount = model.getLineCount();

  for (let line = 1; line <= lineCount; line++) {
    const content = model.getLineContent(line).toLowerCase();
    let pos = 0;
    while ((pos = content.indexOf(searchLower, pos)) !== -1) {
      results.push({
        startLineNumber: line,
        startColumn: pos + 1,
        endLineNumber: line,
        endColumn: pos + searchText.length + 1,
      });
      pos += searchText.length;
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// 単語ハイライト適用（カーソル位置ワード）
// ═══════════════════════════════════════════════════════════════

export function applyWordHighlight(
  ed: editor.IStandaloneCodeEditor,
  prevIds: string[],
): string[] {
  const model = ed.getModel();
  if (!model) return ed.deltaDecorations(prevIds, []);

  const position = ed.getPosition();
  if (!position) return ed.deltaDecorations(prevIds, []);

  const word = extractWordAtCursor(model, position.lineNumber, position.column);
  if (!word || word.length < 1) return ed.deltaDecorations(prevIds, []);

  const ranges = findAllOccurrences(model, word);
  if (ranges.length <= 1) return ed.deltaDecorations(prevIds, []);

  const decorations: editor.IModelDeltaDecoration[] = ranges.map(range => ({
    range,
    options: {
      inlineClassName: 'tt-word-highlight',
      stickiness: 1,
    },
  }));

  return ed.deltaDecorations(prevIds, decorations);
}

// ═══════════════════════════════════════════════════════════════
// キーワードハイライト適用（HighlighterKeyword）
// ═══════════════════════════════════════════════════════════════

export function applyKeywordHighlight(
  ed: editor.IStandaloneCodeEditor,
  keyword: string,
  prevIds: string[],
): string[] {
  const model = ed.getModel();
  if (!model || !keyword.trim()) return ed.deltaDecorations(prevIds, []);

  const groups = keyword.split(',').map(g => g.trim()).filter(Boolean);
  const allDecorations: editor.IModelDeltaDecoration[] = [];

  groups.forEach((group, groupIdx) => {
    const terms = group.split(/\s+/).filter(Boolean);
    const colorIdx = groupIdx % KEYWORD_COLORS.length;
    const className = `tt-keyword-hl-${colorIdx}`;

    terms.forEach(term => {
      const ranges = findAllOccurrences(model, term);
      ranges.forEach(range => {
        allDecorations.push({
          range,
          options: {
            inlineClassName: className,
            stickiness: 1,
          },
        });
      });
    });
  });

  return ed.deltaDecorations(prevIds, allDecorations);
}

// ═══════════════════════════════════════════════════════════════
// 見出しハイライト適用（Markdown # レベル別カラー）
// ═══════════════════════════════════════════════════════════════

/** 見出しレベル別カラー（明るい水色〜青系、全レベル高視認性） */
const HEADING_COLORS = [
  '#5ce0ff',   // H1 - 明るいシアン
  '#45c8f0',   // H2 - ライトブルー
  '#6898ff',   // H3 - ロイヤルブルー
  '#a0b8ff',   // H4 - ペールブルー
  '#8898e8',   // H5 - ペリウィンクル
  '#9a90e0',   // H6 - ラベンダーブルー
];

export function applyHeadingHighlight(
  ed: editor.IStandaloneCodeEditor,
  prevIds: string[],
): string[] {
  const model = ed.getModel();
  if (!model) return ed.deltaDecorations(prevIds, []);

  const decorations: editor.IModelDeltaDecoration[] = [];
  const lineCount = model.getLineCount();

  for (let line = 1; line <= lineCount; line++) {
    const content = model.getLineContent(line);
    const match = content.match(/^(#{1,6})\s/);
    if (!match) continue;

    const level = match[1].length; // 1-6

    decorations.push({
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: content.length + 1,
      },
      options: {
        inlineClassName: `tt-heading-${level}`,
        stickiness: 1,
      },
    });
  }

  return ed.deltaDecorations(prevIds, decorations);
}

// ═══════════════════════════════════════════════════════════════
// CSS注入（初回のみ）
// ═══════════════════════════════════════════════════════════════

let cssInjected = false;

export function injectHighlightCSS(): void {
  if (cssInjected) return;
  cssInjected = true;

  const rules: string[] = [];

  // 単語ハイライト
  rules.push(`.tt-word-highlight {
  background-color: ${WORD_HIGHLIGHT_BG};
  border: ${WORD_HIGHLIGHT_BORDER};
  border-radius: 2px;
}`);

  // キーワードハイライト（エディタ内: ツールバーと同色の背景 + 白文字）
  KEYWORD_COLORS.forEach((color, i) => {
    rules.push(`.tt-keyword-hl-${i} {
  background-color: ${color};
  color: #f0f0f0;
  border-radius: 2px;
}`);
  });

  // 見出しハイライト（レベル別カラー + フォントウェイト）
  HEADING_COLORS.forEach((color, i) => {
    const level = i + 1;
    const weight = level <= 2 ? 'bold' : 'normal';
    rules.push(`.tt-heading-${level} {
  color: ${color} !important;
  font-weight: ${weight};
}`);
  });

  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}
