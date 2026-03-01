/**
 * fix-bq-titles.js
 * BigQuery上の title カラムに含まれる '===' 以降（contentの一部）を削除するスクリプト
 * 
 * 使用方法:
 *   Dry Run (確認のみ): node scripts/fix-bq-titles.js
 *   実行 (更新反映):   node scripts/fix-bq-titles.js --execute
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

const args = process.argv.slice(2);
const IS_EXECUTE = args.includes('--execute');

async function main() {
    console.log('='.repeat(60));
    console.log('BigQuery Title Correction Script');
    console.log(`Mode: ${IS_EXECUTE ? 'EXECUTE (Changes will be applied!)' : 'DRY RUN (No changes)'}`);
    console.log('='.repeat(60));

    let keyFile;
    try {
        keyFile = getCredentials();
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }

    const projectId = keyFile.project_id;
    const bigquery = new BigQuery({
        projectId,
        credentials: keyFile
    });

    const fullTableId = `${projectId}.${DATASET_ID}.${TABLE_ID}`;

    try {
        // 1. 対象レコードの検索
        console.log('Searching for records with "===" in title...');

        const checkQuery = `
            SELECT file_id, title 
            FROM \`${fullTableId}\` 
            WHERE title LIKE '%===%'
        `;

        const [rows] = await bigquery.query({ query: checkQuery });

        if (rows.length === 0) {
            console.log('No records found with "===" in the title.');
            return;
        }

        console.log(`Found ${rows.length} records.`);
        console.log('-'.repeat(60));

        // プレビュー表示
        rows.forEach((row, index) => {
            const currentTitle = row.title;
            // JavaScriptでの修正シミュレーション (SQLのREGEXP_REPLACE相当)
            const newTitle = currentTitle.split('===')[0].trim();

            // 表示数制限（多すぎる場合は省略）
            if (index < 20) {
                console.log(`[${row.file_id}]`);
                console.log(`  Current: "${currentTitle}"`);
                console.log(`  New:     "${newTitle}"`);
                console.log('');
            } else if (index === 20) {
                console.log('... and more records.');
            }
        });
        console.log('-'.repeat(60));

        // 2. 実行モードの場合のみ更新
        if (IS_EXECUTE) {
            console.log('Applying changes to BigQuery...');

            // SQLで一括更新
            // titleの '===' 以降（直前の空白含む）を削除
            const updateQuery = `
                UPDATE \`${fullTableId}\`
                SET title = REGEXP_REPLACE(title, r'\\s*===.*', '')
                WHERE title LIKE '%===%'
            `;

            const [job] = await bigquery.createQueryJob({
                query: updateQuery,
                priority: 'INTERACTIVE'
            });

            console.log(`Job ${job.id} started.`);
            const [result] = await job.getQueryResults();

            // DMLの結果を確認する場合はgetMetadata等が必要だが、通常はエラーなければ完了
            console.log('Update completed successfully.');

            // 再確認
            const [checkRows] = await bigquery.query({ query: checkQuery });
            if (checkRows.length === 0) {
                console.log('Verification passed: No bad titles remain.');
            } else {
                console.warn(`Warning: ${checkRows.length} records still match the condition.`);
            }

        } else {
            console.log('This was a DRY RUN. No changes were made.');
            console.log('To apply changes, run: node scripts/fix-bq-titles.js --execute');
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
