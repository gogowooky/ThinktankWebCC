/**
 * csv.ts
 * CSV パース・シリアライズ関連のユーティリティ関数
 */

import type { CsvValue } from '../types';

/**
 * 値を CSV 形式の文字列に変換
 * - カンマ、ダブルクォート、改行を含む場合はダブルクォートで囲む
 * - ダブルクォートはエスケープ（""）する
 * 
 * @param val 変換する値
 * @returns CSV 形式の文字列
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
 * オブジェクトの配列を CSV 文字列に変換
 * 
 * @param items オブジェクトの配列
 * @param properties 出力するプロパティ名の配列
 * @returns CSV 文字列
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
        const row = properties.map(prop => {
            const val = item[prop];
            return toCsvValue(val as CsvValue);
        });
        content += row.join(',') + '\n';
    }

    return content;
}

/**
 * CSV 文字列を2次元配列にパース
 * - ダブルクォートで囲まれたフィールドをサポート
 * - エスケープされたダブルクォート（""）をサポート
 * - CRLF と LF の両方をサポート
 * 
 * @param content CSV 文字列
 * @returns 2次元配列（行 x 列）
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
                    // エスケープされたダブルクォート
                    curStr += '"';
                    i++;
                } else {
                    // クォート終了
                    inQuote = false;
                }
            } else {
                curStr += c;
            }
        } else {
            if (c === '"') {
                // クォート開始
                inQuote = true;
            } else if (c === ',') {
                // フィールド区切り
                currentRow.push(curStr);
                curStr = '';
            } else if (c === '\n' || c === '\r') {
                // 行末処理
                if (c === '\r' && next === '\n') {
                    // CRLF: CR をスキップし、LF で処理
                    continue;
                }

                // セルをプッシュ
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

    // 最後の行を処理
    if (curStr || currentRow.length > 0) {
        currentRow.push(curStr);
        rows.push(currentRow);
    }

    return rows;
}

/**
 * CSV 文字列をオブジェクトの配列にパース
 * - 1行目をヘッダー（プロパティ名）として使用
 * 
 * @param content CSV 文字列
 * @returns オブジェクトの配列
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
