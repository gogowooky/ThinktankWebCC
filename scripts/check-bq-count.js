/**
 * check-bq-count.js
 * BigQueryテーブルのデータ件数と重複状況を確認するスクリプト
 * 
 * 使用方法:
 * set GOOGLE_SERVICE_ACCOUNT_KEY=<サービスアカウントキーの内容>
 * node scripts/check-bq-count.js
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

async function main() {
    console.log('='.repeat(60));
    console.log('BigQuery データ件数確認スクリプト');
    console.log('='.repeat(60));

    let keyFile;
    try {
        keyFile = getCredentials();
    } catch (e) {
        console.error(e.message);
        console.error('GOOGLE_SERVICE_ACCOUNT_KEY 環境変数を設定してください。');
        process.exit(1);
    }

    const projectId = keyFile.project_id;
    const bigquery = new BigQuery({
        projectId,
        credentials: keyFile
    });

    try {
        // 全件数
        console.log('1. 全レコード数を確認中...');
        const [countRows] = await bigquery.query({
            query: `SELECT COUNT(*) as count FROM \`${projectId}.${DATASET_ID}.${TABLE_ID}\``
        });
        const totalCount = countRows[0].count;
        console.log(`   全レコード数: ${totalCount}`);

        // 重複チェック
        console.log('2. 重複ファイルID（バージョン履歴）を確認中...');
        const [duplicateRows] = await bigquery.query({
            query: `
                SELECT file_id, COUNT(*) as count
                FROM \`${projectId}.${DATASET_ID}.${TABLE_ID}\`
                GROUP BY file_id
                HAVING count > 1
                ORDER BY count DESC
                LIMIT 10
            `
        });

        if (duplicateRows.length === 0) {
            console.log('   重複（同一file_idで複数行）はありません。');
        } else {
            console.log(`   ${duplicateRows.length} 件のIDで重複が見つかりました（Top 10）:`);
            duplicateRows.forEach(row => {
                console.log(`     - ${row.file_id}: ${row.count} records`);
            });
        }

        // ユニークファイル数
        console.log('3. ユニークなファイルID数...');
        const [uniqueRows] = await bigquery.query({
            query: `SELECT COUNT(DISTINCT file_id) as count FROM \`${projectId}.${DATASET_ID}.${TABLE_ID}\``
        });
        console.log(`   ユニーク数: ${uniqueRows[0].count}`);

        console.log('='.repeat(60));
        console.log('確認完了');

    } catch (error) {
        console.error('エラーが発生しました:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);
