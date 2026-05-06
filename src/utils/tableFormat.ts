/**
 * tableFormat.ts
 * table ContentType のテキスト形式パース・エクスポートユーティリティ
 *
 * フォーマット仕様:
 *   1行目: タイトル
 *   ## セクション名
 *   > 列名csv（1行）
 *   データcsv行...
 *   # で始まる行はスキップ（コメント・見出し扱い）
 */

export interface TableSection {
  title:   string;
  columns: string[];
  rows:    string[][];
}

/** RFC 4180 準拠の CSV 行パーサー */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = false;
      } else {
        current += ch;
      }
    } else {
      if      (ch === '"') inQuote = true;
      else if (ch === ',') { result.push(current); current = ''; }
      else                 current += ch;
    }
  }
  result.push(current);
  return result;
}

/** table Content 文字列をセクション配列にパース */
export function parseTableContent(content: string): TableSection[] {
  const lines = content.split('\n').slice(1); // 1行目(タイトル)はスキップ
  const sections: TableSection[] = [];
  let current: TableSection | null = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.slice(3).trim(), columns: [], rows: [] };
    } else if (line.startsWith('>') && current && current.columns.length === 0) {
      current.columns = parseCsvLine(line.slice(1).trim());
    } else if (line.startsWith('#')) {
      // コメント/見出し行 → スキップ
    } else if (current && line.trim()) {
      current.rows.push(parseCsvLine(line));
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** セクションを CSV 文字列に変換（BOM なし） */
export function sectionToCsv(section: TableSection): string {
  const esc = (cell: string) =>
    cell.includes(',') || cell.includes('"') || cell.includes('\n')
      ? `"${cell.replace(/"/g, '""')}"` : cell;
  return [
    section.columns.map(esc).join(','),
    ...section.rows.map(row => row.map(esc).join(',')),
  ].join('\r\n');
}

/** セクション配列を table Content 文字列に変換 */
export function sectionsToTableContent(title: string, sections: TableSection[]): string {
  const esc = (cell: string) =>
    cell.includes(',') || cell.includes('"') ? `"${cell.replace(/"/g, '""')}"` : cell;
  let result = title + '\n';
  for (const s of sections) {
    result += `## ${s.title}\n`;
    result += `> ${s.columns.map(esc).join(',')}\n`;
    for (const row of s.rows) result += row.map(esc).join(',') + '\n';
  }
  return result.trimEnd();
}
