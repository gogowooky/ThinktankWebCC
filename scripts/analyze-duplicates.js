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
        // 1. (file_id, category) の組み合わせで真の重複を見つける
        // ※ MERGE のキーは file_id + IFNULL(category,'') なので、これが同じレコードが真の重複
        console.log('Finding true duplicates by (file_id, category)...');
        const findDupQuery = `
            SELECT file_id, IFNULL(category, '(null)') as category, COUNT(*) as cnt
            FROM \`${fullTableId}\`
            GROUP BY file_id, IFNULL(category, '(null)')
            HAVING cnt > 1
            ORDER BY cnt DESC
            LIMIT 10
        `;
        const [dupGroups] = await bigquery.query({ query: findDupQuery });

        if (dupGroups.length === 0) {
            console.log('No true duplicates found based on (file_id, category).');

            // 参考: file_id だけで見た重複（カテゴリ違いで同一 file_id が複数あるケース）も表示
            console.log('\nChecking file_id-only duplicates (may differ in category)...');
            const fileIdOnlyQuery = `
                SELECT file_id, COUNT(*) as cnt,
                       STRING_AGG(IFNULL(category, '(null)'), ', ' ORDER BY category) as categories
                FROM \`${fullTableId}\`
                GROUP BY file_id
                HAVING cnt > 1
                ORDER BY cnt DESC
                LIMIT 10
            `;
            const [fileIdGroups] = await bigquery.query({ query: fileIdOnlyQuery });
            if (fileIdGroups.length === 0) {
                console.log('No duplicates found even by file_id alone.');
            } else {
                console.log(`Found ${fileIdGroups.length} file_ids with multiple rows (different categories):`);
                fileIdGroups.forEach(g => {
                    console.log(`  file_id="${g.file_id}" (${g.cnt} rows) categories: ${g.categories}`);
                });
            }
            return;
        }

        console.log(`Found ${dupGroups.length} true duplicate (file_id, category) groups (Top 10):`);

        // 2. 重複レコードの詳細を表示
        for (const group of dupGroups) {
            const catDisplay = group.category === '(null)' ? '(null)' : `"${group.category}"`;
            console.log(`\n--- File ID: ${group.file_id}, Category: ${catDisplay} (Count: ${group.cnt}) ---`);
            const detailQuery = `
                SELECT file_id, category, title, file_type, updated_at
                FROM \`${fullTableId}\`
                WHERE file_id = @fileId
                  AND IFNULL(category, '(null)') = @category
                ORDER BY updated_at DESC
            `;
            const [rows] = await bigquery.query({
                query: detailQuery,
                params: { fileId: group.file_id, category: group.category }
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
