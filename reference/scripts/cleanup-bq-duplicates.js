import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';

async function main() {
    const keyFile = JSON.parse(fs.readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8'));
    const bq = new BigQuery({
        projectId: keyFile.project_id,
        credentials: keyFile
    });

    const datasetId = 'thinktank';
    const tableId = 'files';
    const projectId = keyFile.project_id;

    // 重複を削除して、各 (file_id, category) ごとに最新の updated_at のレコードだけを残すクエリ
    const query = `
        CREATE OR REPLACE TABLE \`${projectId}.${datasetId}.${tableId}\` AS
        SELECT * EXCEPT(row_num)
        FROM (
            SELECT *,
                   ROW_NUMBER() OVER(
                       PARTITION BY file_id, IFNULL(category, '') 
                       ORDER BY updated_at DESC
                   ) as row_num
            FROM \`${projectId}.${datasetId}.${tableId}\`
        )
        WHERE row_num = 1
    `;

    console.log('重複削除（クリーンアップ）を実行します...');

    try {
        await bq.query({ query });
        console.log('クリーンアップ完了。テーブルが再作成され、重複は排除されました。');
    } catch (e) {
        console.error('クリーンアップエラー:', e);
    }
}
main();
