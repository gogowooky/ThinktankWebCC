/**
 * textOnCursor.ts
 * カーソル位置にある URL・ファイルパス・タグを 1 行の文字列から探す。
 */

function matchAt(line: string, column: number, pattern: RegExp): RegExpExecArray | null {
  for (const match of line.matchAll(pattern)) {
    const startCol = match.index + 1;
    if (column >= startCol && column <= startCol + match[0].length) return match as RegExpExecArray;
  }
  return null;
}

function isQuotedLink(text: string): boolean {
  return /^(?:https?|file):\/\//i.test(text) || /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(text);
}

export interface TextOnCursorRange {
  /** URL・パス・タグの文字列（引用符は含まない） */
  text: string;
  /** 置き換える範囲（1 始まりの桁。引用符で囲まれていれば引用符も含む） */
  startColumn: number;
  endColumn: number;
}

/** findTextOnCursor() と同じ規則で探し、行内の範囲も返す。見つからなければ null */
export function findTextRangeOnCursor(line: string, column: number): TextOnCursorRange | null {
  // 空白を含むパスは引用符で囲まれるので、引用符の中を最優先で見る
  const quoted = matchAt(line, column, /"([^"]+)"/g);
  if (quoted && isQuotedLink(quoted[1])) {
    return { text: quoted[1], startColumn: quoted.index + 1, endColumn: quoted.index + 1 + quoted[0].length };
  }
  const match = matchAt(line, column, /https?:\/\/[^\s")]+/g)
    ?? matchAt(line, column, /([a-zA-Z]:\\|\\\\)[^\s"<>|?*]+/g)
    ?? matchAt(line, column, /\[([^\]]+)\]/g);
  return match ? { text: match[0], startColumn: match.index + 1, endColumn: match.index + 1 + match[0].length } : null;
}

/**
 * @param column 1 始まりの桁（Monaco の Position.column）
 * @returns 見つからなければ空文字
 */
export function findTextOnCursor(line: string, column: number): string {
  return findTextRangeOnCursor(line, column)?.text ?? '';
}
