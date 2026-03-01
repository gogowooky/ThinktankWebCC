/**
 * check-category.js
 * BigQueryのcategory状況を確認
 */

const fs = require('fs');
const { BigQuery } = require('@google-cloud/bigquery');

async function main() {
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!credentials) {
        console.error('GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません');
        process.exit(1);
    }

    const keyFile = JSON.parse(credentials);
    const projectId = keyFile.project_id;

    const bigquery = new BigQuery({
        projectId,
        credentials: keyFile
    });

    console.log('Category別レコード数:');
    const [rows] = await bigquery.query({
        query: `
            SELECT category, COUNT(*) as count
            FROM \`${projectId}.thinktank.files\`
            GROUP BY category
        `
    });

    for (const row of rows) {
        console.log(`  ${row.category || '(null)'}: ${row.count}件`);
    }
}

main().catch(console.error);
