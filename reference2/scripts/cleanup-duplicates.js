/**
 * cleanup-duplicates.js
 * 重複レコードを削除する（テーブル再作成方式）
 * 
 * Strategy:
 * 1. file_id, category ごとに updated_at が最新の1件のみを抽出
 * 2. その結果でテーブルを置換 (CREATE OR REPLACE TABLE)
 * 
 * Usage:
 *   node scripts/cleanup-duplicates.js            (Dry Run: Count duplicates)
 *   node scripts/cleanup-duplicates.js --execute  (Execute: Replace table)
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

const args = process.argv.slice(2);
const IS_EXECUTE = args.includes('--execute');

async function main() {
    console.log('='.repeat(60));
    console.log('BigQuery Duplicate Cleanup Script');
    console.log(`Mode: ${IS_EXECUTE ? 'EXECUTE (Table will be REPLACED!)' : 'DRY RUN (Check only)'}`);
    console.log('='.repeat(60));

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
        // 1. 現状の重複数を確認
        console.log('Checking current duplicates...');

        // 重複定義: file_idとcategoryが同じで、updated_atが新しい順にランク付けし、ランク > 1 のもの
        const duplicateCountQuery = `
            SELECT COUNT(*) as duplicate_count
            FROM (
                SELECT 
                    ROW_NUMBER() OVER (PARTITION BY file_id, IFNULL(category, '') ORDER BY updated_at DESC) as rn
                FROM \`${fullTableId}\`
            )
            WHERE rn > 1
        `;

        const [rows] = await bigquery.query({ query: duplicateCountQuery });
        const duplicateCount = rows[0].duplicate_count;

        console.log(`Found ${duplicateCount} duplicate records to be removed.`);

        if (duplicateCount === 0) {
            console.log('No duplicates found. Nothing to do.');
            return;
        }

        if (IS_EXECUTE) {
            console.log('\n!!! WARNING !!!');
            console.log('This will overwite the table with deduplicated data.');
            console.log('Starting cleanup in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            const cleanupQuery = `
                CREATE OR REPLACE TABLE \`${fullTableId}\` AS
                SELECT * EXCEPT(rn)
                FROM (
                    SELECT *,
                        ROW_NUMBER() OVER (PARTITION BY file_id, IFNULL(category, '') ORDER BY updated_at DESC) as rn
                    FROM \`${fullTableId}\`
                )
                WHERE rn = 1
            `;

            console.log('Running CREATE OR REPLACE TABLE query...');
            const [job] = await bigquery.createQueryJob({
                query: cleanupQuery,
                priority: 'INTERACTIVE'
            });
            console.log(`Job ${job.id} started.`);

            await job.getQueryResults(); // Wait for completion
            console.log('Cleanup completed successfully.');

            // Verify
            const [checkRows] = await bigquery.query({ query: duplicateCountQuery });
            console.log(`Remaining duplicates: ${checkRows[0].duplicate_count}`);

        } else {
            console.log('\nThis was a DRY RUN.');
            console.log('To execute the cleanup, run: node scripts/cleanup-duplicates.js --execute');
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
