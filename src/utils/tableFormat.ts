/**
 * tableFormat.ts
 * table ContentType のテキスト形式パース・エクスポートユーティリティ
 *
 * フォーマット仕様:
 *   1行目: タイトル
 *   > 列名csv（行頭が > の行、最初の1行のみ列定義として有効）
 *   値csv行...（通常のCSV行はデータ行）
 *   # で始まる行はコメント行（保存時も保持、データとして扱わない）
 *   ; で始まる行はコメント行（保存時も保持、データとして扱わない）
 *
 * 保存ルール:
 *   - filter/sort による表示順変更はファイルのデータ行位置を変更しない
 *   - カラム順変更は保存時に各データ行の列順を更新する
 *   - 新規追加行はファイル末尾に追加する
 */

export type RawLineType = 'columns' | 'data' | 'comment' | 'empty';

export interface RawLine {
  type:    RawLineType;
  text:    string;
  rowIdx?: number;  // type === 'data' のときのみ、rows[] のインデックス
}

export interface TableSection {
  title:    string;
  columns:  string[];
  rows:     string[][];
  rawLines: RawLine[];  // タイトル行以外の全行（コメント・空行を含む）
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

/** CSV セル値エスケープ */
function escapeCsv(cell: string): string {
  return cell.includes(',') || cell.includes('"') || cell.includes('\n')
    ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * table Content 文字列を TableSection 配列にパース。
 * 新フォーマット: > で列定義（最初のみ有効）、# と ; はコメント行。
 * 戻り値は 0 または 1 要素の配列。
 */
export function parseTableContent(content: string): TableSection[] {
  const allLines = content.split('\n');
  const title    = allLines[0] ?? '';
  const lines    = allLines.slice(1);

  const columns:  string[]   = [];
  const rows:     string[][] = [];
  const rawLines: RawLine[]  = [];

  for (const line of lines) {
    if (line.startsWith('>') && columns.length === 0) {
      // 最初の > 行を列定義として採用
      const cols = parseCsvLine(line.slice(1).trim());
      columns.push(...cols);
      rawLines.push({ type: 'columns', text: line });
    } else if (line.startsWith('>')) {
      // 2番目以降の > 行はコメント扱いで保持
      rawLines.push({ type: 'comment', text: line });
    } else if (line.startsWith('#') || line.startsWith(';')) {
      rawLines.push({ type: 'comment', text: line });
    } else if (!line.trim()) {
      rawLines.push({ type: 'empty', text: line });
    } else {
      const rowIdx = rows.length;
      rows.push(parseCsvLine(line));
      rawLines.push({ type: 'data', text: line, rowIdx });
    }
  }

  if (columns.length === 0 && rows.length === 0) return [];
  return [{ title, columns, rows, rawLines }];
}

/**
 * TableSection を Content 文字列に変換。
 * rawLines の順序を維持し、コメント・空行をそのまま保持する。
 * columnOrder を指定すると、列定義行とデータ行の列順を変換して書き出す。
 */
export function tableSectionToContent(
  title:       string,
  section:     TableSection,
  columnOrder?: number[],
): string {
  const order = columnOrder ?? section.columns.map((_, i) => i);

  // rawLines がない（XLSX インポート等）場合はシンプルに生成
  if (!section.rawLines || section.rawLines.length === 0) {
    let out = title + '\n';
    if (section.columns.length > 0)
      out += '> ' + section.columns.map(escapeCsv).join(',') + '\n';
    for (const row of section.rows)
      out += row.map(escapeCsv).join(',') + '\n';
    return out.trimEnd();
  }

  // rawLines に columns エントリが存在するか確認
  const hasColumnsEntry = section.rawLines.some(r => r.type === 'columns');

  let result = title + '\n';

  // columns エントリが rawLines に無い場合はファイル先頭に出力する
  if (!hasColumnsEntry && section.columns.length > 0) {
    result += '> ' + order.map(i => escapeCsv(section.columns[i] ?? '')).join(',') + '\n';
  }

  for (const raw of section.rawLines) {
    switch (raw.type) {
      case 'columns':
        result += '> ' + order.map(i => escapeCsv(section.columns[i] ?? '')).join(',') + '\n';
        break;
      case 'data': {
        const row = section.rows[raw.rowIdx!] ?? [];
        result += order.map(i => escapeCsv(row[i] ?? '')).join(',') + '\n';
        break;
      }
      default:
        result += raw.text + '\n';
    }
  }

  return result.trimEnd();
}

/**
 * セクション配列を Content 文字列に変換（後方互換 / XLSX インポート用）。
 * rawLines がない Section にも対応する。
 */
export function sectionsToTableContent(title: string, sections: TableSection[]): string {
  if (sections.length === 0) return title;
  return tableSectionToContent(title, sections[0]);
}

/** セクションを CSV 文字列に変換（BOM なし） */
export function sectionToCsv(section: TableSection): string {
  return [
    section.columns.map(escapeCsv).join(','),
    ...section.rows.map(row => row.map(escapeCsv).join(',')),
  ].join('\r\n');
}
