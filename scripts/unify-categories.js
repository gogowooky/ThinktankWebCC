/**
 * unify-categories.js
 * 'memo' (小文字) カテゴリを 'Memo' (大文字) に統一する
 * 
 * Usage:
 *   node scripts/unify-categories.js            (Dry Run)
 *   node scripts/unify-categories.js --execute  (Execute UPDATE)
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

const args = process.argv.slice(2);
const IS_EXECUTE = args.includes('--execute');

async function main() {
    console.log('='.repeat(60));
    console.log('BigQuery Category Unification Script');
    console.log(`Mode: ${IS_EXECUTE ? 'EXECUTE (Changes will be applied!)' : 'DRY RUN (Check only)'}`);
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
        // 1. 対象件数確認
        const checkQuery = `
            SELECT COUNT(*) as count
            FROM \`${fullTableId}\`
            WHERE category = 'memo'
        `;
        const [rows] = await bigquery.query({ query: checkQuery });
        const count = rows[0].count;

        console.log(`Found ${count} records with category='memo'.`);

        if (count === 0) {
            console.log('No records to update.');
            return;
        }

        if (IS_EXECUTE) {
            console.log('Updating records to category="Memo"...');

            const updateQuery = `
                UPDATE \`${fullTableId}\`
                SET category = 'Memo'
                WHERE category = 'memo'
            `;

            const [job] = await bigquery.createQueryJob({
                query: updateQuery,
                priority: 'INTERACTIVE'
            });
            console.log(`Job ${job.id} started.`);

            await job.getQueryResults();
            console.log('Update completed successfully.');

        } else {
            console.log('This was a DRY RUN.');
            console.log('To execute the update, run: node scripts/unify-categories.js --execute');
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main().catch(console.error);
