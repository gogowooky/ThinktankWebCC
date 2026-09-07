/**
 * searchTagFormat.ts
 * docs/DefaultSearchTag.md 形式（ID, "Description", URL）のパース。
 * server/routes/systemRoutes.ts の同等ロジックをクライアント側（Vaultメモ上書き用）に移植したもの。
 */

export interface SearchTagRow {
  id:          string;
  description: string;
  url:         string;
}

/** docs/DefaultSearchTag.md 形式のテキストを行ごとにパースする（#始まり・空行はコメントとして無視） */
export function parseSearchTagContent(content: string): SearchTagRow[] {
  const rows: SearchTagRow[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const firstComma = trimmed.indexOf(',');
    const lastComma  = trimmed.lastIndexOf(',');
    if (firstComma === -1 || firstComma === lastComma) continue;

    const id          = trimmed.slice(0, firstComma).trim();
    const description = trimmed.slice(firstComma + 1, lastComma).trim().replace(/^"|"$/g, '');
    const url         = trimmed.slice(lastComma + 1).trim();
    if (id && description) rows.push({ id, description, url });
  }
  return rows;
}
