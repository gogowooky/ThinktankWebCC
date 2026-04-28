/**
 * csv.ts
 * CSV パース・シリアライズ関連のユーティリティ関数
 */

import type { CsvValue } from '../types';

/**
 * 値を CSV 形式の文字列に変換する。
 * カンマ・ダブルクォート・改行を含む場合はダブルクォートで囲む。
 * ダブルクォートは "" にエスケープする。
 */
export function toCsvValue(val: CsvValue): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * オブジェクトの配列を CSV 文字列に変換する。
 * @param items  シリアライズするオブジェクトの配列
 * @param properties  出力するプロパティ名の配列（ヘッダー行順）
 */
export function toCsv(
  items: Record<string, unknown>[],
  properties: string[]
): string {
  if (properties.length === 0) return '';

  const header = properties.map(p => toCsvValue(p)).join(',') + '\n';
  const rows = items.map(item => {
    return properties.map(prop => toCsvValue(item[prop] as CsvValue)).join(',');
  }).join('\n');

  return header + rows + (rows.length > 0 ? '\n' : '');
}

/**
 * CSV 文字列を 2 次元配列にパースする。
 * - ダブルクォートで囲まれたフィールドをサポート
 * - エスケープされたダブルクォート（""）をサポート
 * - CRLF と LF の両方をサポート
 * @returns 行 × 列の文字列配列（1行目がヘッダー）
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
          i++;  // エスケープされたクォート
        } else {
          inQuote = false;  // クォート終了
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
      } else if (c === '\r') {
        // CRLF: CR をスキップ（次の LF で行末処理）
        continue;
      } else if (c === '\n') {
        currentRow.push(curStr);
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
        curStr = '';
      } else {
        curStr += c;
      }
    }
  }

  // 最後の行（末尾改行なしの場合）
  if (curStr || currentRow.length > 0) {
    currentRow.push(curStr);
    if (currentRow.length > 1 || currentRow[0] !== '') {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * CSV 文字列をオブジェクトの配列にパースする。
 * 1 行目をヘッダー（プロパティ名）として使用する。
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
    headers.forEach((header, idx) => {
      obj[header.trim()] = row[idx];
    });
    results.push(obj as T);
  }

  return results;
}
