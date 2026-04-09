/**
 * BigQuery テーブルの重複レコードを削除するクリーンアップスクリプト
 *
 * 各 (file_id, category) の組み合わせで最新 (updated_at) の1件だけを残し、
 * 残りを削除します。
 */
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';

async function cleanup() {
    const keyFileStr = fs.readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8');
    const keyFile = JSON.parse(keyFileStr);
    const bigquery = new BigQuery({
        projectId: keyFile.project_id,
        credentials: keyFile
    });
    const projectId = keyFile.project_id;
    const table = `\`${projectId}.thinktank.files\``;

    console.log('=== BigQuery 重複レコード クリーンアップ ===\n');

    // 現在の状態確認
    const [before] = await bigquery.query({
        query: `SELECT COUNT(*) as total FROM ${table}`
    });
    console.log(`クリーンアップ前 総レコード数: ${before[0].total}`);

    const [dupsBefore] = await bigquery.query({
        query: `
            SELECT COUNT(*) as dup_groups FROM (
                SELECT file_id, IFNULL(category,'') as category, COUNT(*) as cnt
                FROM ${table}
                GROUP BY file_id, category
                HAVING cnt > 1
            )
        `
    });
    console.log(`重複グループ数: ${dupsBefore[0].dup_groups}`);

    // 重複削除: 各 (file_id, category) で最新 updated_at を持つ行以外を削除
    // BigQuery は行識別に _row_id を持たないため、一時テーブル経由で処理
    console.log('\n重複削除クエリを実行中...');

    const cleanupQuery = `
        CREATE OR REPLACE TABLE ${table}
        AS
        SELECT *
        FROM (
            SELECT *,
                   ROW_NUMBER() OVER (
                       PARTITION BY file_id, IFNULL(category, '')
                       ORDER BY updated_at DESC, created_at DESC
                   ) AS rn
            FROM ${table}
        )
        WHERE rn = 1
    `;

    // created_at / updated_at は TIMESTAMP 型なので rn カラムは除外
    const cleanupQuery2 = `
        CREATE OR REPLACE TABLE \`${projectId}.thinktank.files\`
        AS
        WITH ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (
                       PARTITION BY file_id, IFNULL(category, '')
                       ORDER BY updated_at DESC, created_at DESC
                   ) AS rn
            FROM \`${projectId}.thinktank.files\`
        )
        SELECT
            file_id, title, file_type, category, content, metadata, size_bytes, created_at, updated_at
        FROM ranked
        WHERE rn = 1
    `;

    await bigquery.query({ query: cleanupQuery2 });
    console.log('削除完了');

    // 結果確認
    const [after] = await bigquery.query({
        query: `SELECT COUNT(*) as total FROM \`${projectId}.thinktank.files\``
    });
    console.log(`\nクリーンアップ後 総レコード数: ${after[0].total}`);

    const [dupsAfter] = await bigquery.query({
        query: `
            SELECT COUNT(*) as dup_groups FROM (
                SELECT file_id, IFNULL(category,'') as category, COUNT(*) as cnt
                FROM \`${projectId}.thinktank.files\`
                GROUP BY file_id, category
                HAVING cnt > 1
            )
        `
    });
    console.log(`残存重複グループ数: ${dupsAfter[0].dup_groups}`);

    const deleted = Number(before[0].total) - Number(after[0].total);
    console.log(`\n削除したレコード数: ${deleted}`);
    console.log('=== クリーンアップ完了 ===');
}

cleanup().catch(e => {
    console.error('クリーンアップ失敗:', e.message || e);
    process.exit(1);
});
