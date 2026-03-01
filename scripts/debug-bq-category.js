import { BigQuery } from '@google-cloud/bigquery';
import { getCredentials } from './config.js';

async function main() {
    const keyFile = getCredentials();
    const bq = new BigQuery({
        projectId: keyFile.project_id,
        credentials: keyFile
    });

    const query = `
        SELECT file_id, file_type, category, created_at, updated_at 
        FROM thinktank.files 
        WHERE file_id IN ('Status', 'Editings', 'Memos')
        ORDER BY file_id, updated_at DESC
        LIMIT 20
    `;

    try {
        const [rows] = await bq.query({ query });
        console.log("=== Status/Editings/Memos の最近のレコード ===");
        rows.forEach(r => {
            console.log(`[${r.file_id}] type:${r.file_type} category:${r.category === null ? 'NULL' : `"${r.category}"`} updated:${r.updated_at.value}`);
        });
    } catch (e) {
        console.error(e);
    }
}
main();
