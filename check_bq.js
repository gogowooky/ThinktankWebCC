import { BigQuery } from '@google-cloud/bigquery';

async function checkData() {
    const DATASET_ID = 'thinktank';
    const TABLE_ID = 'files';

    try {
        const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
        let bigquery;
        let projectId;
        if (credentials) {
            const keyFile = JSON.parse(credentials);
            projectId = keyFile.project_id;
            bigquery = new BigQuery({
                projectId,
                credentials: keyFile
            });
        } else {
            console.log("No credentials found in process.env.GOOGLE_SERVICE_ACCOUNT_KEY");
            return;
        }

        const query = `
            SELECT file_id, title, category, metadata, updated_at
            FROM \`${DATASET_ID}.${TABLE_ID}\`
            WHERE file_id LIKE '%2026-01-05-091016%'
               OR title LIKE '%2026-01-05-091016%'
            ORDER BY updated_at DESC
            LIMIT 10
        `;
        const [rows] = await bigquery.query({ query });
        console.log("Results:");
        console.dir(rows, { depth: null });
    } catch (e) {
        console.error("Error:", e);
    }
}

checkData();
