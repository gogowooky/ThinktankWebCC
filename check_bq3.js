import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';

async function checkTable() {
    try {
        const keyFileStr = fs.readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8');
        const keyFile = JSON.parse(keyFileStr);
        const bigquery = new BigQuery({
            projectId: keyFile.project_id,
            credentials: keyFile
        });

        const projectId = keyFile.project_id;

        // 総レコード数
        const [countRows] = await bigquery.query({
            query: `SELECT COUNT(*) as total FROM \`${projectId}.thinktank.files\``
        });
        console.log('総レコード数:', countRows[0].total);

        // 重複レコード確認
        const [dupRows] = await bigquery.query({
            query: `
                SELECT file_id, IFNULL(category,'') as category, COUNT(*) as cnt
                FROM \`${projectId}.thinktank.files\`
                GROUP BY file_id, category
                HAVING cnt > 1
                ORDER BY cnt DESC
                LIMIT 10
            `
        });
        if (dupRows.length === 0) {
            console.log('重複レコードなし（各file_id+categoryに1レコード）');
        } else {
            console.log('重複レコードあり（同一キーに複数行）:');
            dupRows.forEach(r => console.log(r));
        }

        // 最終Memo保存時刻
        const [latestRows] = await bigquery.query({
            query: `SELECT MAX(updated_at) as latest FROM \`${projectId}.thinktank.files\` WHERE category = 'Memo'`
        });
        console.log('最終Memo更新時刻:', latestRows[0].latest);

        // カテゴリ別件数
        const [catRows] = await bigquery.query({
            query: `SELECT category, COUNT(*) as cnt FROM \`${projectId}.thinktank.files\` GROUP BY category ORDER BY cnt DESC`
        });
        console.log('\nカテゴリ別レコード数:');
        catRows.forEach(r => console.log(` category=${r.category}: ${r.cnt}件`));

    } catch (e) {
        console.error("Error:", e.message || e);
    }
}

checkTable();
