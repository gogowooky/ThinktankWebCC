/**
 * analyze-duplicates.js
 * file_id が重複しているレコードを詳細に調査するスクリプト
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

async function main() {
    console.log('Analyzing duplicates in BigQuery...');

    let keyFile;
    try {
        keyFile = getCredentials();
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }

    const projectId = keyFile.project_id;
    const bigquery = new BigQuery({ projectId, credentials: keyFile });
    const fullTableId = `${projectId}.${DATASET_ID}.${TABLE_ID}`;

    try {
        // 1. 重複している file_id を見つける
        console.log('Finding duplicate file_ids...');
        const findDupQuery = `
            SELECT file_id, COUNT(*) as cnt
            FROM \`${fullTableId}\`
            GROUP BY file_id
            HAVING cnt > 1
            ORDER BY cnt DESC
            LIMIT 10
        `;
        const [dupGroups] = await bigquery.query({ query: findDupQuery });

        if (dupGroups.length === 0) {
            console.log('No duplicates found based on file_id.');
            return;
        }

        console.log(`Found ${dupGroups.length} file_ids with duplicates (Top 10):`);

        // 2. 重複レコードの詳細を表示
        for (const group of dupGroups) {
            console.log(`\n--- File ID: ${group.file_id} (Count: ${group.cnt}) ---`);
            const detailQuery = `
                SELECT file_id, category, title, file_type, updated_at
                FROM \`${fullTableId}\`
                WHERE file_id = @fileId
                ORDER BY updated_at DESC
            `;
            const [rows] = await bigquery.query({
                query: detailQuery,
                params: { fileId: group.file_id }
            });

            rows.forEach((row, idx) => {
                const catDisplay = row.category === null ? '(null)' : `"${row.category}"`;
                console.log(`  [${idx + 1}] Category: ${catDisplay}, Type: ${row.file_type}, Updated: ${row.updated_at.value}, Title: "${row.title}"`);
            });
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
