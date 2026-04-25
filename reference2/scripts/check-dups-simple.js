/**
 * check-dups-simple.js
 * 重複数を確認して結果をファイルに書き出す簡易スクリプト
 */
import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';
import fs from 'fs';

async function main() {
    let keyFile;
    try {
        keyFile = getCredentials();
    } catch (e) {
        fs.writeFileSync('./scripts/dup-result.txt', 'ERROR: ' + e.message, 'utf8');
        process.exit(1);
    }

    const projectId = keyFile.project_id;
    const bigquery = new BigQuery({ projectId, credentials: keyFile });
    const fullTableId = `${projectId}.${DATASET_ID}.${TABLE_ID}`;

    const lines = [];
    lines.push(`Table: ${fullTableId}`);

    try {
        // (file_id, category) 組み合わせで重複をカウント
        const q1 = `
            SELECT COUNT(*) as duplicate_count
            FROM (
                SELECT ROW_NUMBER() OVER (
                    PARTITION BY file_id, IFNULL(category, '')
                    ORDER BY updated_at DESC
                ) as rn
                FROM \`${fullTableId}\`
            )
            WHERE rn > 1
        `;
        const [rows1] = await bigquery.query({ query: q1 });
        lines.push(`Duplicates (file_id+category): ${rows1[0].duplicate_count}`);

        // file_id のみで重複をカウント
        const q2 = `
            SELECT COUNT(*) as cnt
            FROM (
                SELECT file_id, COUNT(*) as c
                FROM \`${fullTableId}\`
                GROUP BY file_id
                HAVING c > 1
            )
        `;
        const [rows2] = await bigquery.query({ query: q2 });
        lines.push(`Duplicate file_ids (by file_id only): ${rows2[0].cnt}`);

        // 総レコード数
        const q3 = `SELECT COUNT(*) as total FROM \`${fullTableId}\``;
        const [rows3] = await bigquery.query({ query: q3 });
        lines.push(`Total records: ${rows3[0].total}`);

    } catch (e) {
        lines.push('ERROR: ' + e.message);
    }

    const result = lines.join('\n');
    console.log(result);
    fs.writeFileSync('./scripts/dup-result.txt', result, 'utf8');
}

main().catch(e => {
    fs.writeFileSync('./scripts/dup-result.txt', 'FATAL: ' + e.message, 'utf8');
});
