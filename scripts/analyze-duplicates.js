/**
 * analyze-duplicates.js
 * (file_id, category) の組み合わせが重複しているレコードを調査するスクリプト
 * 
 * Usage:
 *   node scripts/analyze-duplicates.js
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

async function main() {
    console.log('Analyzing duplicates in BigQuery...');
    console.log('Key: (file_id + category)\n');

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
        // 1. 総レコード数を確認
        const countQuery = `SELECT COUNT(*) as total FROM \`${fullTableId}\``;
        const [countRows] = await bigquery.query({ query: countQuery });
        console.log(`Total records: ${countRows[0].total}`);

        // 2. (file_id + category) の組み合わせで重複数をカウント
        const dupCountQuery = `
            SELECT COUNT(*) as duplicate_count
            FROM (
                SELECT
                    ROW_NUMBER() OVER (
                        PARTITION BY file_id, IFNULL(category, '')
                        ORDER BY updated_at DESC
                    ) as rn
                FROM \`${fullTableId}\`
            )
            WHERE rn > 1
        `;
        const [dupCountRows] = await bigquery.query({ query: dupCountQuery });
        const duplicateCount = dupCountRows[0].duplicate_count;
        console.log(`Duplicate records (file_id+category): ${duplicateCount}`);

        if (duplicateCount === 0) {
            console.log('\nNo duplicates found. Database is clean.');
            return;
        }

        // 3. 重複している (file_id, category) の組み合わせを列挙（上位10件）
        console.log('\nFinding duplicate (file_id, category) groups (Top 10):');
        const findDupQuery = `
            SELECT file_id, IFNULL(category, '(null)') as category, COUNT(*) as cnt
            FROM \`${fullTableId}\`
            GROUP BY file_id, category
            HAVING cnt > 1
            ORDER BY cnt DESC
            LIMIT 10
        `;
        const [dupGroups] = await bigquery.query({ query: findDupQuery });

        if (dupGroups.length === 0) {
            console.log('No (file_id, category) groups with duplicates found.');
            return;
        }

        console.log(`Found ${dupGroups.length} duplicate group(s):`);

        // 4. 各重複グループの詳細を表示
        for (const group of dupGroups) {
            console.log(`\n--- File ID: ${group.file_id}, Category: ${group.category} (Count: ${group.cnt}) ---`);
            const detailQuery = `
                SELECT file_id, category, title, file_type, updated_at
                FROM \`${fullTableId}\`
                WHERE file_id = @fileId
                  AND IFNULL(category, '') = @catKey
                ORDER BY updated_at DESC
            `;
            const catKey = group.category === '(null)' ? '' : group.category;
            const [rows] = await bigquery.query({
                query: detailQuery,
                params: { fileId: group.file_id, catKey }
            });

            rows.forEach((row, idx) => {
                const catDisplay = row.category === null ? '(null)' : `"${row.category}"`;
                const updatedAt = row.updated_at?.value || row.updated_at;
                const marker = idx === 0 ? ' ← KEEP (latest)' : ' ← DELETE';
                console.log(`  [${idx + 1}] Category: ${catDisplay}, Type: ${row.file_type}, Updated: ${updatedAt}, Title: "${row.title}"${marker}`);
            });
        }

        console.log('\nTo remove duplicates, run:');
        console.log('  node scripts/cleanup-duplicates.js --execute');

    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
