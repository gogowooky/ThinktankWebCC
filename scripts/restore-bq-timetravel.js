/**
 * restore-bq-timetravel.js
 * BigQueryのタイムトラベル機能を使って、指定時刻のデータに復元するスクリプト
 * 
 * 使用方法:
 *   set GOOGLE_SERVICE_ACCOUNT_KEY=<サービスアカウントキーの内容>
 *   node scripts/restore-bq-timetravel.js
 * 
 * オプション:
 *   --hours=N   N時間前の状態に復元（デフォルト: 1）
 *   --dry-run   実際には復元せず、復元対象のデータ件数を確認するだけ
 */

import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

async function main() {
    console.log('='.repeat(60));
    console.log('BigQuery タイムトラベル復元スクリプト');
    console.log('='.repeat(60));

    // コマンドライン引数の解析
    const args = process.argv.slice(2);
    const hoursArg = args.find(a => a.startsWith('--hours='));
    const hours = hoursArg ? parseInt(hoursArg.split('=')[1], 10) : 15;
    const dryRun = args.includes('--dry-run');

    if (dryRun) {
        console.log('[DRY RUN] 実際の復元は行いません。データ確認のみです。');
    }

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

    const fullTableId = `\`${projectId}.${DATASET_ID}.${TABLE_ID}\``;

    try {
        // Step 1: 現在のデータ件数を確認
        console.log('\n1. 現在のデータ件数を確認中...');
        const [currentCountRows] = await bigquery.query({
            query: `SELECT COUNT(*) as count FROM ${fullTableId}`
        });
        const currentCount = currentCountRows[0].count;
        console.log(`   現在のレコード数: ${currentCount}`);

        // Step 2: タイムトラベルで過去のデータ件数を確認
        console.log(`\n2. ${hours}時間前のデータ件数を確認中...`);
        const [pastCountRows] = await bigquery.query({
            query: `SELECT COUNT(*) as count FROM ${fullTableId} FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${hours} HOUR)`
        });
        const pastCount = pastCountRows[0].count;
        console.log(`   ${hours}時間前のレコード数: ${pastCount}`);

        // Step 3: 差分を確認
        console.log('\n3. 差分サマリー...');
        console.log(`   現在: ${currentCount} 件`);
        console.log(`   復元先 (${hours}h前): ${pastCount} 件`);
        console.log(`   差分: ${Number(currentCount) - Number(pastCount)} 件`);

        if (dryRun) {
            console.log('\n[DRY RUN] ここで終了します。');
            console.log('実際に復元する場合は --dry-run フラグを外して再実行してください。');
            return;
        }

        // Step 4: 復元を実行
        console.log(`\n4. 復元を実行中... (${hours}時間前のスナップショットでテーブルを置換)`);

        // 一時テーブルにタイムトラベルデータをコピー
        const tempTableId = `${TABLE_ID}_backup_${Date.now()}`;
        console.log(`   バックアップテーブル作成: ${DATASET_ID}.${tempTableId}`);

        await bigquery.query({
            query: `CREATE TABLE \`${projectId}.${DATASET_ID}.${tempTableId}\` AS SELECT * FROM ${fullTableId}`
        });
        console.log('   現在のデータをバックアップしました。');

        // テーブルをタイムトラベルデータで置換
        await bigquery.query({
            query: `CREATE OR REPLACE TABLE ${fullTableId} AS SELECT * FROM ${fullTableId} FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${hours} HOUR)`
        });

        // 復元後の件数を確認
        const [restoredCountRows] = await bigquery.query({
            query: `SELECT COUNT(*) as count FROM ${fullTableId}`
        });
        const restoredCount = restoredCountRows[0].count;

        console.log(`\n5. 復元完了！`);
        console.log(`   復元後のレコード数: ${restoredCount}`);
        console.log(`   バックアップテーブル: ${DATASET_ID}.${tempTableId}`);
        console.log(`   (不要になったらバックアップテーブルを手動で削除してください)`);

    } catch (error) {
        console.error('\nエラーが発生しました:', error.message);
        if (error.message.includes('SYSTEM_TIME')) {
            console.error('タイムトラベルが利用できない可能性があります。テーブルの設定を確認してください。');
        }
        process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('完了');
}

main().catch(console.error);
