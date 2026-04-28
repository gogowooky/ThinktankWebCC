/**
 * create-bigquery-table.js
 * BigQueryデータセットとテーブルを作成するスクリプト
 */

const fs = require('fs');
const { BigQuery } = require('@google-cloud/bigquery');

const DATASET_ID = 'thinktank';
const TABLE_ID = 'files';
const LOCATION = 'asia-northeast1';

async function main() {
    console.log('BigQuery データセット・テーブル作成スクリプト');
    console.log('='.repeat(50));

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

    // データセット作成
    console.log(`データセット作成中: ${DATASET_ID} (${LOCATION})`);
    try {
        await bigquery.createDataset(DATASET_ID, { location: LOCATION });
        console.log('  データセット作成完了');
    } catch (e) {
        if (e.code === 409) {
            console.log('  データセットは既に存在します');
        } else {
            throw e;
        }
    }

    // テーブル作成
    const schema = [
        { name: 'file_id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'title', type: 'STRING', mode: 'NULLABLE' },
        { name: 'file_type', type: 'STRING', mode: 'REQUIRED' },
        { name: 'category', type: 'STRING', mode: 'NULLABLE' },
        { name: 'content', type: 'STRING', mode: 'NULLABLE' },
        { name: 'metadata', type: 'JSON', mode: 'NULLABLE' },
        { name: 'size_bytes', type: 'INT64', mode: 'NULLABLE' },
        { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
    ];

    console.log(`テーブル作成中: ${TABLE_ID}`);
    try {
        const dataset = bigquery.dataset(DATASET_ID);
        await dataset.createTable(TABLE_ID, { schema });
        console.log('  テーブル作成完了');
    } catch (e) {
        if (e.code === 409) {
            console.log('  テーブルは既に存在します');
        } else {
            throw e;
        }
    }

    console.log('');
    console.log('完了！');
    console.log(`BigQuery コンソール: https://console.cloud.google.com/bigquery?project=${projectId}`);
}

main().catch(console.error);
