/**
 * check-categories.js
 * BigQuery上の category ごとの件数を集計する
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

async function main() {
    console.log('Checking category distribution in BigQuery...');

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
        const query = `
            SELECT IFNULL(category, '(null)') as category, COUNT(*) as count
            FROM \`${fullTableId}\`
            GROUP BY category
            ORDER BY count DESC
        `;

        const [rows] = await bigquery.query({ query });

        console.log('Category Counts:');
        console.log('-----------------------------');
        let total = 0;
        rows.forEach(row => {
            console.log(`${row.category.padEnd(20)}: ${row.count}`);
            total += row.count;
        });
        console.log('-----------------------------');
        console.log(`Total Records: ${total}`);

    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
