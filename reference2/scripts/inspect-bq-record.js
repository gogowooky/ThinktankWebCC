/**
 * inspect-bq-record.js
 * 特定のファイルIDのレコードを取得し、Titleの詳細（文字コード等）を表示する
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

async function main() {
    const targetId = process.argv[2];
    if (!targetId) {
        console.error('Usage: node inspect-bq-record.js <file_id>');
        process.exit(1);
    }

    console.log(`Inspecting File ID: ${targetId}`);

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
            SELECT file_id, title, updated_at
            FROM \`${fullTableId}\` 
            WHERE file_id = @fileId
        `;

        const [rows] = await bigquery.query({
            query,
            params: { fileId: targetId }
        });

        if (rows.length === 0) {
            console.log('Record not found.');
            return;
        }

        const row = rows[0];
        console.log('--------------------------------------------------');
        console.log(`File ID:    ${row.file_id}`);
        console.log(`Updated At: ${row.updated_at.value}`);
        console.log(`Title:      "${row.title}"`);
        console.log('--------------------------------------------------');

        if (row.title) {
            console.log('Title Character Codes:');
            for (let i = 0; i < row.title.length; i++) {
                const code = row.title.charCodeAt(i);
                const char = row.title[i];
                process.stdout.write(`'${char}'(${code.toString(16).toUpperCase()}) `);
            }
            console.log('\n--------------------------------------------------');

            // Check for equal signs
            const hasHalfEqual = row.title.includes('=');
            const hasFullEqual = row.title.includes('＝');
            console.log(`Has Half-width '=': ${hasHalfEqual}`);
            console.log(`Has Full-width '＝': ${hasFullEqual}`);
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
