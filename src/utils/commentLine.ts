/**
 * commentLine.ts
 * Default*.md（DefaultShortcut / DefaultColor / DefaultSearchTag / DefaultMenu）と、
 * それらを上書きする Vault メモで共通のコメント行の規則。
 *
 *   行頭の空白を無視したうえで # ; > | のいずれかで始まる行はコメント。
 *   （表形式の最初の > 行だけは列見出し。その判定は tableFormat.ts が先に行う）
 *
 * サーバーが直接読む DefaultSearchTag.md 用に、server/routes/systemRoutes.ts にも同じ規則がある。
 */

export const COMMENT_LINE_RE = /^\s*[#;>|]/;

export function isCommentLine(line: string): boolean {
  return COMMENT_LINE_RE.test(line);
}
