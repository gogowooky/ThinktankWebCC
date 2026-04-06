import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';

async function main() {
    const keyFile = JSON.parse(fs.readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8'));
    const bq = new BigQuery({
        projectId: keyFile.project_id,
        credentials: keyFile
    });

    const query = `
        SELECT file_id, file_type, category, created_at, updated_at 
        FROM thinktank.files 
        WHERE file_id = 'Status'
        ORDER BY updated_at DESC
        LIMIT 30
    `;

    try {
        const [rows] = await bq.query({ query });
        console.log(`=== Status レコード全件 (${rows.length}件) ===`);
        rows.forEach((r, i) => {
            console.log(`[${i + 1}] type:${r.file_type} category:${r.category === null ? 'NULL' : `'${r.category}'`} updated:${r.updated_at.value} created:${r.created_at.value}`);
        });
    } catch (e) {
        console.error(e);
    }
}
main();
