/**
 * tableFormat.ts
 * table ContentType のテキスト形式パース・エクスポートユーティリティ
 *
 * フォーマット仕様:
 *   1行目: タイトル（保存先では frontmatter / BQ の title）
 *   列ヘッダー: metadata の colheader（CSV文字列）。本文には書かない
 *   値csv行...（通常のCSV行はデータ行）
 *   # ; > | で始まる行はコメント行（保存時も保持、データとして扱わない）
 *
 * 旧形式: colheader が無い table は、本文の最初の > 行を列ヘッダーとして読む。
 * DataGrid から保存すると colheader へ移し、本文の > 行を消す。
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
  /** 列ヘッダーの出所。'metadata' なら本文に列定義行を書き出さない */
  headerSource?: 'metadata' | 'body';
  /** 列ヘッダーの原文（> を除く）。データ行の桁揃え幅をここから求める */
  headerText?: string;
}

const COMMENT_PREFIXES = ['#', ';', '>', '|'];

function isCommentLine(line: string): boolean {
  return COMMENT_PREFIXES.some(p => line.startsWith(p));
}

/** think.Metadata.colheader を列ヘッダー文字列として取り出す（無効値は undefined） */
export function readColHeader(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const value = (metadata as Record<string, unknown>).colheader;
  return typeof value === 'string' && value.trim() ? value : undefined;
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
 * colheader（think.Metadata.colheader）があればそれを列ヘッダーとし、> 行はすべてコメント。
 * 無ければ旧形式として最初の > 行を列ヘッダーとして読む。
 * 戻り値は 0 または 1 要素の配列。
 */
export function parseTableContent(content: string, colheader?: string): TableSection[] {
  const allLines = content.split('\n');
  const title    = allLines[0] ?? '';
  const lines    = allLines.slice(1);

  const fromMetadata = !!colheader?.trim();
  const columns:  string[]   = fromMetadata ? parseCsvLine(colheader!.trim()) : [];
  const rows:     string[][] = [];
  const rawLines: RawLine[]  = [];
  let headerText = fromMetadata ? colheader! : undefined;

  for (const line of lines) {
    if (!fromMetadata && line.startsWith('>') && headerText === undefined) {
      columns.push(...parseCsvLine(line.slice(1).trim()));
      headerText = line.slice(1);
      rawLines.push({ type: 'columns', text: line });
    } else if (isCommentLine(line)) {
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
  return [{ title, columns, rows, rawLines, headerSource: fromMetadata ? 'metadata' : 'body', headerText }];
}

/**
 * 列ヘッダーを colheader へ移した section を返す（本文の列定義行を取り除く）。
 * 戻り値の colheader を think.Metadata.colheader に、content を本文として保存する。
 */
export function tableSectionToMetadataForm(
  title:        string,
  section:      TableSection,
  columnOrder?: number[],
): { content: string; colheader: string } {
  const migrated: TableSection = {
    ...section,
    rawLines: section.rawLines.filter(r => r.type !== 'columns'),
    headerSource: 'metadata',
  };
  return {
    content:   tableSectionToContent(title, migrated, columnOrder),
    colheader: tableHeaderText(section, columnOrder),
  };
}

/**
 * colheader を本文の > 行に戻した旧形式の文字列を返す。
 * 本文だけを受け取って解釈する処理（UI設定・ショートカットの読み込み）へ渡すため。
 */
export function tableContentWithBodyHeader(content: string, colheader?: string): string {
  if (!colheader?.trim()) return content;
  const nl = content.indexOf('\n');
  const title = nl === -1 ? content : content.slice(0, nl);
  const body  = nl === -1 ? '' : content.slice(nl + 1);
  return `${title}\n> ${colheader.trim()}${body ? `\n${body}` : ''}`;
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
  const colWidths = headerColumnWidths(section);
  const headerInBody = section.headerSource !== 'metadata';

  // rawLines がない（XLSX インポート等）場合はシンプルに生成
  if (!section.rawLines || section.rawLines.length === 0) {
    let out = title + '\n';
    if (headerInBody && section.columns.length > 0)
      out += '> ' + section.columns.map(escapeCsv).join(',') + '\n';
    for (const row of section.rows)
      out += row.map(escapeCsv).join(',') + '\n';
    return out.trimEnd();
  }

  // rawLines に columns エントリが存在するか確認
  const hasColumnsEntry = section.rawLines.some(r => r.type === 'columns');

  let result = title + '\n';

  // columns エントリが rawLines に無い場合はファイル先頭に出力する
  if (headerInBody && !hasColumnsEntry && section.columns.length > 0) {
    result += '> ' + order.map(i => escapeCsv(section.columns[i] ?? '')).join(',') + '\n';
  }

  for (const raw of section.rawLines) {
    switch (raw.type) {
      case 'columns':
        result += '> ' + paddedCells(section.columns, order, colWidths) + '\n';
        break;
      case 'data':
        result += paddedCells(section.rows[raw.rowIdx!] ?? [], order, colWidths) + '\n';
        break;
      default:
        result += raw.text + '\n';
    }
  }

  return result.trimEnd();
}

/** 列ヘッダーの原文から各列の表示幅（パディング）を求める */
function headerColumnWidths(section: TableSection): number[] {
  const colWidths: number[] = [];
  const headerText = section.headerText
    ?? section.rawLines?.find(r => r.type === 'columns')?.text.slice(1);
  if (headerText === undefined) return colWidths;
  const headerTokens = parseCsvLine(headerText);
  for (let i = 0; i < section.columns.length; i++) {
    const token = headerTokens[i] ?? '';
    // 1列目は先頭のスペース（>との間のスペース）を除いた幅を有効幅とする
    colWidths[i] = i === 0 ? token.trimStart().length : token.length;
  }
  return colWidths;
}

function paddedCells(cells: string[], order: number[], colWidths: number[]): string {
  return order.map((origIdx, orderIdx) => {
    const val = escapeCsv(cells[origIdx] ?? '');
    const targetWidth = colWidths[origIdx] ?? 0;
    return orderIdx < order.length - 1 && val.length < targetWidth ? val.padEnd(targetWidth) : val;
  }).join(',');
}

/** colheader に保存する列ヘッダー文字列（本文の > 行と同じ桁揃え） */
export function tableHeaderText(section: TableSection, columnOrder?: number[]): string {
  const order = columnOrder ?? section.columns.map((_, i) => i);
  return paddedCells(section.columns, order, headerColumnWidths(section));
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

/**
 * 指定したキー列の値に一致するデータ行の、特定列の値を更新し、新しいコンテンツ文字列を返す。
 * コメントや空行の構造はそのまま維持される。
 *
 * @param content 元のテーブルコンテンツ文字列
 * @param keyColumnName 検索キーとする列名（例: "key"）
 * @param updates キー値と「列名: 新しい値」のマッピング
 *                例: { "TextEditor.LineNumbers.IsVisible": { "current": "true" } }
 * @param isConstKeyed 一部の行が "const" 等で固定されている場合に更新をスキップする条件（省略可）
 */
export function updateTableContent(
  content: string,
  keyColumnName: string,
  updates: Record<string, Record<string, string>>,
  isConstKeyed?: (key: string) => boolean,
): string {
  const sections = parseTableContent(content);
  const section = sections[0];
  if (!section) return content;

  const keyIdx = section.columns.findIndex(c => c === keyColumnName);
  if (keyIdx < 0) return content;

  // 各データ行について更新処理を実行
  const newRows = section.rows.map((row) => {
    const rowKey = row[keyIdx]?.trim() ?? '';
    if (!rowKey) return row;
    
    // 定数行などで更新をスキップする場合
    if (isConstKeyed && isConstKeyed(rowKey)) return row;

    const rowUpdates = updates[rowKey];
    if (!rowUpdates) return row;

    const newRow = [...row];
    for (const [colName, newVal] of Object.entries(rowUpdates)) {
      // current 列または value 列（後方互換）のインデックスを探して更新
      let colIdx = section.columns.findIndex(c => c === colName);
      if (colIdx < 0 && colName === 'current') {
        // current が見つからない場合は value を探す
        colIdx = section.columns.findIndex(c => c === 'value');
      }
      if (colIdx >= 0) {
        newRow[colIdx] = newVal;
      }
    }
    return newRow;
  });

  return tableSectionToContent(section.title, { ...section, rows: newRows });
}
