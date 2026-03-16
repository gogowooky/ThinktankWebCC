import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';

async function checkData() {
    try {
        const keyFileStr = fs.readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8');
        const keyFile = JSON.parse(keyFileStr);
        const bigquery = new BigQuery({
            projectId: keyFile.project_id,
            credentials: keyFile
        });

        const q2 = `
            SELECT file_id, title, category, created_at, updated_at
            FROM \`thinktank.files\`
            WHERE category = 'Memo' AND CONTAINS_SUBSTR(content, '東京')
            QUALIFY ROW_NUMBER() OVER (PARTITION BY file_id ORDER BY updated_at DESC) = 1
            ORDER BY updated_at DESC LIMIT 10
        `;

        const [rows] = await bigquery.query({ query: q2 });
        // 結果出力
        rows.forEach(r => {
            console.log("-------------------");
            console.log("file_id:", r.file_id);
            console.log("title:", r.title);
            console.log("category:", r.category);
            console.log("created_at:", r.created_at ? r.created_at.value : r.created_at);
            console.log("updated_at:", r.updated_at ? r.updated_at.value : r.updated_at);
            console.log("metadata:", r.metadata);
            if (r.content) {
                console.log("content starts with:", r.content.substring(0, 100).replace(/\n/g, '\\n'));
                console.log("contains DELETE?:", r.content.includes("DELETE"));
            }
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

checkData();
