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

/**
 * @param column 1 始まりの桁（Monaco の Position.column）
 * @returns 見つからなければ空文字
 */
export function findTextOnCursor(line: string, column: number): string {
  // 空白を含むパスは引用符で囲まれるので、引用符の中を最優先で見る
  const quoted = matchAt(line, column, /"([^"]+)"/g);
  if (quoted && isQuotedLink(quoted[1])) return quoted[1];
  const match = matchAt(line, column, /https?:\/\/[^\s")]+/g)
    ?? matchAt(line, column, /([a-zA-Z]:\\|\\\\)[^\s"<>|?*]+/g)
    ?? matchAt(line, column, /\[([^\]]+)\]/g);
  return match?.[0] ?? '';
}
