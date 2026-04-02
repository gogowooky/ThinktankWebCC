/**
 * csv.ts
 * CSV パース・シリアライズユーティリティ
 */

import type { CsvValue } from '../types';

/**
 * 値をCSV形式の文字列に変換
 * カンマ、ダブルクォート、改行を含む場合はクォートで囲む
 */
export function toCsvValue(val: CsvValue): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * オブジェクト配列をCSV文字列に変換
 */
export function toCsv(
  items: Record<string, unknown>[],
  properties: string[]
): string {
  if (properties.length === 0) return '';

  // ヘッダー行
  let content = properties.map(p => toCsvValue(p)).join(',') + '\n';

  // データ行
  for (const item of items) {
    const row = properties.map(prop => toCsvValue(item[prop] as CsvValue));
    content += row.join(',') + '\n';
  }

  return content;
}

/**
 * CSV文字列を2次元配列にパース
 * ダブルクォート囲み、エスケープ、CRLF/LFをサポート
 */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let curStr = '';
  let inQuote = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (inQuote) {
      if (c === '"') {
        if (next === '"') {
          curStr += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        curStr += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ',') {
        currentRow.push(curStr);
        curStr = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && next === '\n') {
          continue;
        }
        currentRow.push(curStr);
        if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        curStr = '';
      } else {
        curStr += c;
      }
    }
  }

  // 最後の行
  if (curStr || currentRow.length > 0) {
    currentRow.push(curStr);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * CSV文字列をオブジェクト配列にパース（1行目をヘッダーとして使用）
 */
export function parseCsvToObjects<T extends Record<string, string>>(
  content: string
): T[] {
  const rows = parseCsv(content);
  if (rows.length === 0) return [];

  const headers = rows[0];
  const results: T[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== headers.length) continue;

    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header.trim()] = row[index];
    });
    results.push(obj as T);
  }

  return results;
}
