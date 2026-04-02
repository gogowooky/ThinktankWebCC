/**
 * backup-memos-from-bigquery.js
 * BigQueryからメモデータをバックアップ（エクスポート）するスクリプト
 * 
 * 指定されたBACKUP_DIR以下に、category/file_id.md の形式で保存します。
 * 重複データがある場合は updated_at が最新のものを優先します。
 * 
 * 使用方法:
 * set GOOGLE_SERVICE_ACCOUNT_KEY=<サービスアカウントキーの内容>
 * node scripts/backup-memos-from-bigquery.js
 */

import fs from 'fs';
import path from 'path';
import { BigQuery } from '@google-cloud/bigquery';
import { DATASET_ID, TABLE_ID, BACKUP_DIR as BASE_BACKUP_DIR, getCredentials } from './config.js';

// 日付フォーマット (yymmdd)
const now = new Date();
const yymmdd = now.getFullYear().toString().slice(-2) +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');

// バックアップディレクトリ名に日付を付与
const BACKUP_DIR = `${BASE_BACKUP_DIR}_${yymmdd}`;

/**
 * メイン処理
 */
async function main() {
    console.log('='.repeat(60));
    console.log('メモデータ BigQuery バックアップスクリプト');
    console.log('='.repeat(60));

    let keyFile;
    try {
        keyFile = getCredentials();
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }

    const projectId = keyFile.project_id;
    console.log(`プロジェクトID: ${projectId}`);
    console.log(`データセット: ${DATASET_ID}`);
    console.log(`テーブル: ${TABLE_ID}`);
    console.log(`バックアップ先: ${BACKUP_DIR}`);
    console.log('');

    // BigQueryクライアント初期化
    const bigquery = new BigQuery({
        projectId,
        credentials: keyFile
    });

    try {
        // バックアップ先ディレクトリの作成
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
            console.log(`ディレクトリ作成: ${BACKUP_DIR}`);
        }

        // データの取得（重複排除: file_idごとにupdated_atが最新のものを取得）
        console.log('BigQueryからデータを取得中...');
        const query = `
            SELECT * EXCEPT(rn)
            FROM (
                SELECT *, ROW_NUMBER() OVER(PARTITION BY file_id ORDER BY updated_at DESC) as rn
                FROM \`${projectId}.${DATASET_ID}.${TABLE_ID}\`
            )
            WHERE rn = 1
        `;

        const [rows] = await bigquery.query({ query });
        console.log(`取得完了: ${rows.length} 件`);
        console.log('');

        if (rows.length === 0) {
            console.log('データがありません。終了します。');
            process.exit(0);
        }

        console.log('ファイル保存開始...');
        let savedCount = 0;
        let errorCount = 0;

        for (const row of rows) {
            try {
                const fileId = row.file_id;
                const category = row.category || 'uncategorized'; // カテゴリがない場合はその他へ
                const content = row.content || '';

                // カテゴリディレクトリの作成
                const categoryDir = path.join(BACKUP_DIR, category);
                if (!fs.existsSync(categoryDir)) {
                    fs.mkdirSync(categoryDir, { recursive: true });
                }

                // ファイルパス
                // 拡張子は .md 固定とする（要望: file_id.md）
                const filePath = path.join(categoryDir, `${fileId}.md`);

                // ファイル書き込み (UTF-8)
                fs.writeFileSync(filePath, content, 'utf8');
                savedCount++;

                // 進捗表示 (100件ごと)
                if (savedCount % 100 === 0) {
                    process.stdout.write(`.`);
                }
            } catch (err) {
                console.error(`\nエラー: ${row.file_id} の保存に失敗 - ${err.message}`);
                errorCount++;
            }
        }

        console.log('');
        console.log('='.repeat(60));
        console.log('バックアップ完了！');
        console.log(`保存成功: ${savedCount} 件`);
        if (errorCount > 0) {
            console.log(`エラー: ${errorCount} 件`);
        }
        console.log('='.repeat(60));

    } catch (error) {
        console.error('');
        console.error('エラーが発生しました:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);
