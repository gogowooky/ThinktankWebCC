import { BigQuery } from '@google-cloud/bigquery';

const projectId = 'gogowooky';
const datasetId = 'thinktank';
const tableId = 'files';

const bigquery = new BigQuery({ projectId });

async function checkRecord() {
    const query = `
    SELECT file_id, title, content
    FROM \\\`${projectId}.${datasetId}.${tableId}\\\`
    WHERE file_id = '2025-09-22-123020'
  `;

    try {
        const [rows] = await bigquery.query(query);
        if (rows.length > 0) {
            console.log('--- FOUND RECORD ---');
            console.log('ID:', rows[0].file_id);
            console.log('TITLE:', rows[0].title);
            console.log('CONTENT LENGTH:', rows[0].content ? rows[0].content.length : 0);
            console.log('INDEX OF "あすか":', rows[0].content ? rows[0].content.indexOf('あすか') : -1);
            console.log('INDEX OF "ASKA":', rows[0].content ? rows[0].content.indexOf('ASKA') : -1);
            console.log('CONTENT START:\\n', rows[0].content ? rows[0].content.substring(0, 500) : '');
        } else {
            console.log('Record not found.');
        }
    } catch (error) {
        console.error('ERROR:', error);
    }
}

checkRecord();
