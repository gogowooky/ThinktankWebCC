// table 形式の RFC 4180 CSVパース、構造維持部分更新（仕様書03 §3, §4）

export interface RawLine {
  type: 'title' | 'comment' | 'blank' | 'header' | 'data';
  text: string;
  dataIndex?: number; // type === 'data' のとき rows 内のインデックス
}

export interface TableSection {
  title: string;
  columns: string[];
  rows: string[][];
  rawLines: RawLine[];
}

/** RFC 4180 準拠のCSV行パーサー */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ',') {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

export function escapeCsvValue(v: string): string {
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function parseTableContent(content: string): TableSection {
  const lines = content.split('\n');
  const rawLines: RawLine[] = [];
  let columns: string[] = [];
  const rows: string[][] = [];
  let headerSeen = false;

  lines.forEach((line, idx) => {
    if (idx === 0) {
      rawLines.push({ type: 'title', text: line });
      return;
    }
    const trimmed = line.trim();
    if (trimmed === '') {
      rawLines.push({ type: 'blank', text: line });
    } else if (trimmed.startsWith('#') || trimmed.startsWith(';')) {
      rawLines.push({ type: 'comment', text: line });
    } else if (!headerSeen && trimmed.startsWith('>')) {
      headerSeen = true;
      columns = parseCsvLine(trimmed.replace(/^>\s*/, '')).map((c) => c.trim());
      rawLines.push({ type: 'header', text: line });
    } else if (headerSeen) {
      const row = parseCsvLine(line);
      rawLines.push({ type: 'data', text: line, dataIndex: rows.length });
      rows.push(row);
    } else {
      // ヘッダー前の通常行はコメント扱いで構造維持
      rawLines.push({ type: 'comment', text: line });
    }
  });

  return { title: lines[0] ?? '', columns, rows, rawLines };
}

/** rawLines の行順序を維持しながら再シリアライズする */
export function tableSectionToContent(section: TableSection): string {
  const out: string[] = [];
  for (const raw of section.rawLines) {
    switch (raw.type) {
      case 'title':
        out.push(section.title);
        break;
      case 'comment':
      case 'blank':
        out.push(raw.text);
        break;
      case 'header':
        out.push(`> ${section.columns.map(escapeCsvValue).join(',')}`);
        break;
      case 'data': {
        const row = section.rows[raw.dataIndex!];
        if (row !== undefined) out.push(row.map(escapeCsvValue).join(','));
        break;
      }
    }
  }
  // rawLines に存在しない新規追加行（行追加操作後）を末尾に出力する
  const emitted = section.rawLines.filter((r) => r.type === 'data').length;
  for (let i = emitted; i < section.rows.length; i++) {
    out.push(section.rows[i].map(escapeCsvValue).join(','));
  }
  return out.join('\n');
}

/**
 * 構造維持部分更新（仕様書03 §4.1）
 * keyColumn の値が updates のキーに一致する行の valueColumn のみを書き換える。
 */
export function updateTableContent(
  content: string,
  keyColumn: string,
  valueColumn: string,
  updates: Map<string, string>,
): string {
  const section = parseTableContent(content);
  const keyIdx = section.columns.indexOf(keyColumn);
  const valIdx = section.columns.indexOf(valueColumn);
  if (keyIdx < 0 || valIdx < 0) return content;

  const newRows = section.rows.map((row) => {
    const key = row[keyIdx];
    if (key !== undefined && updates.has(key)) {
      const copy = [...row];
      while (copy.length <= valIdx) copy.push('');
      copy[valIdx] = updates.get(key)!;
      return copy;
    }
    return row;
  });

  return tableSectionToContent({ ...section, rows: newRows });
}
