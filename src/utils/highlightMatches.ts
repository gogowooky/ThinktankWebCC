/**
 * highlightMatches.ts
 * Highlighter の検索語から、本文中のヒット位置を求める。
 *
 * 語の解釈（カンマ＝グループ区切り／空白＝単語区切り、全語をOR条件）は、ヒット間移動と
 * [THINK:id,語] で開いたときの初回移動の両方が同じでなければならないので、ここだけに置く。
 */

import {
  buildWordPattern,
  splitHighlighterGroups,
  splitHighlighterWords,
  type HighlighterPatternOptions,
} from './highlighterPattern';

export interface HighlightRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface HighlightModel {
  findMatches(
    searchString: string,
    searchOnlyEditableRange: boolean,
    isRegex: boolean,
    matchCase: boolean,
    wordSeparators: string | null,
    captureMatches: boolean,
  ): { range: HighlightRange }[];
}

export interface HighlightEditor {
  getModel(): HighlightModel | null;
}

/** ヒット位置を先頭から順に返す。語が空・モデル無し・ヒット無しはいずれも空配列。 */
export function findHighlightRanges(
  editor: HighlightEditor | null,
  highlightWord: string,
  options: HighlighterPatternOptions = {}
): HighlightRange[] {
  const model = editor?.getModel();
  if (!model) return [];

  const groups = splitHighlighterGroups(highlightWord);
  const words: string[] = [];
  groups.forEach(g => {
    words.push(...splitHighlighterWords(g));
  });
  if (words.length === 0) return [];

  const patterns = words.map(w => buildWordPattern(w, options));
  const pattern = patterns.join('|');
  const matchCase = options.matchCase ?? false;

  try {
    return model.findMatches(pattern, true, true, matchCase, null, false)
      .map(m => m.range)
      .sort((a, b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn);
  } catch {
    return [];
  }
}
