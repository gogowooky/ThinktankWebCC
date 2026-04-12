/**
 * create-extended-bq-tables.js
 * Phase 02 差分: 拡張BigQueryテーブル作成スクリプト
 *
 * 対象テーブル（Phase 12〜20 で使用）:
 *   - tt_ai_context   (Phase 11: AIコンテキストソース設定)
 *   - tt_suggestions  (Phase 12: AI提案・リコール履歴)
 *   - tt_reminders    (Phase 12: リマインダー)
 *   - tt_entries      (Phase 13: 統一エントリー)
 *   - tt_embeddings   (Phase 15: Embeddingメタデータ)
 *   - tt_digests      (Phase 20: 週次・月次ダイジェスト)
 *
 * 実行方法:
 *   node scripts/create-extended-bq-tables.js
 *
 * 前提条件:
 *   - GOOGLE_SERVICE_ACCOUNT_KEY 環境変数が設定済み
 *   - thinktank データセットが既に存在すること (Phase02 基本テーブルで作成済み)
 */

const { BigQuery } = require('@google-cloud/bigquery');

const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
    : null;

if (!credentials) {
    console.error('[ERROR] GOOGLE_SERVICE_ACCOUNT_KEY 環境変数が設定されていません');
    process.exit(1);
}

const PROJECT_ID = credentials.project_id;
const DATASET_ID = 'thinktank';
const LOCATION = 'asia-northeast1';

const bq = new BigQuery({
    projectId: PROJECT_ID,
    credentials,
});

// ──────────────────────────────────────────────
// テーブル定義
// ──────────────────────────────────────────────

const TABLES = [
    {
        id: 'tt_ai_context',
        description: 'Phase 11: AIコンテキストソース設定',
        schema: [
            { name: 'id',            type: 'STRING',    mode: 'REQUIRED' },
            { name: 'source_type',   type: 'STRING',    mode: 'REQUIRED' }, // 'current_memo' | 'drive_folder' | 'tag' | 'related'
            { name: 'source_ref',    type: 'STRING',    mode: 'NULLABLE' }, // Drive folder ID / tag name etc.
            { name: 'enabled',       type: 'BOOL',      mode: 'REQUIRED' },
            { name: 'priority',      type: 'INT64',     mode: 'NULLABLE' },
            { name: 'created_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'updated_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
    },
    {
        id: 'tt_suggestions',
        description: 'Phase 12: AI提案・リコール履歴',
        schema: [
            { name: 'id',            type: 'STRING',    mode: 'REQUIRED' },
            { name: 'type',          type: 'STRING',    mode: 'REQUIRED' }, // 'recall' | 'pattern' | 'reminder_alert'
            { name: 'title',         type: 'STRING',    mode: 'NULLABLE' },
            { name: 'body',          type: 'STRING',    mode: 'NULLABLE' },
            { name: 'related_ids',   type: 'STRING',    mode: 'NULLABLE' }, // JSON array of memo IDs
            { name: 'status',        type: 'STRING',    mode: 'REQUIRED' }, // 'pending' | 'shown' | 'dismissed'
            { name: 'shown_at',      type: 'TIMESTAMP', mode: 'NULLABLE' },
            { name: 'created_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'updated_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
    },
    {
        id: 'tt_reminders',
        description: 'Phase 12: リマインダー',
        schema: [
            { name: 'id',            type: 'STRING',    mode: 'REQUIRED' },
            { name: 'memo_id',       type: 'STRING',    mode: 'NULLABLE' },
            { name: 'remind_at',     type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'title',         type: 'STRING',    mode: 'NULLABLE' },
            { name: 'body',          type: 'STRING',    mode: 'NULLABLE' },
            { name: 'status',        type: 'STRING',    mode: 'REQUIRED' }, // 'active' | 'fired' | 'dismissed'
            { name: 'fired_at',      type: 'TIMESTAMP', mode: 'NULLABLE' },
            { name: 'created_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'updated_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
    },
    {
        id: 'tt_entries',
        description: 'Phase 13: 統一エントリー (テキスト以外を含む)',
        schema: [
            { name: 'id',            type: 'STRING',    mode: 'REQUIRED' },
            { name: 'entry_type',    type: 'STRING',    mode: 'REQUIRED' }, // 'text' | 'image' | 'audio' | 'video' | 'url' | 'file'
            { name: 'title',         type: 'STRING',    mode: 'NULLABLE' },
            { name: 'content',       type: 'STRING',    mode: 'NULLABLE' }, // テキスト本文 or URL or Drive ID
            { name: 'mime_type',     type: 'STRING',    mode: 'NULLABLE' },
            { name: 'drive_file_id', type: 'STRING',    mode: 'NULLABLE' }, // Google Drive file ID
            { name: 'thumbnail_url', type: 'STRING',    mode: 'NULLABLE' },
            { name: 'tags',          type: 'STRING',    mode: 'NULLABLE' }, // JSON array
            { name: 'metadata',      type: 'JSON',      mode: 'NULLABLE' },
            { name: 'deleted',       type: 'BOOL',      mode: 'REQUIRED' },
            { name: 'created_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'updated_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
    },
    {
        id: 'tt_embeddings',
        description: 'Phase 15: Embeddingメタデータ',
        schema: [
            { name: 'id',            type: 'STRING',    mode: 'REQUIRED' },
            { name: 'source_id',     type: 'STRING',    mode: 'REQUIRED' }, // memo ID or entry ID
            { name: 'source_type',   type: 'STRING',    mode: 'REQUIRED' }, // 'memo' | 'entry'
            { name: 'model',         type: 'STRING',    mode: 'REQUIRED' }, // embedding model name
            { name: 'vector',        type: 'FLOAT64',   mode: 'REPEATED' }, // embedding vector
            { name: 'text_hash',     type: 'STRING',    mode: 'NULLABLE' }, // SHA256 of source text (再生成判定用)
            { name: 'created_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'updated_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
    },
    {
        id: 'tt_digests',
        description: 'Phase 20: 週次・月次ダイジェスト',
        schema: [
            { name: 'id',            type: 'STRING',    mode: 'REQUIRED' },
            { name: 'digest_type',   type: 'STRING',    mode: 'REQUIRED' }, // 'weekly' | 'monthly'
            { name: 'period_start',  type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'period_end',    type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'title',         type: 'STRING',    mode: 'NULLABLE' },
            { name: 'body',          type: 'STRING',    mode: 'NULLABLE' }, // Markdown
            { name: 'related_ids',   type: 'STRING',    mode: 'NULLABLE' }, // JSON array of memo IDs
            { name: 'status',        type: 'STRING',    mode: 'REQUIRED' }, // 'generated' | 'shown' | 'archived'
            { name: 'created_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
            { name: 'updated_at',    type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
    },
];

// ──────────────────────────────────────────────
// テーブル作成ロジック
// ──────────────────────────────────────────────

async function ensureDataset() {
    const dataset = bq.dataset(DATASET_ID);
    const [exists] = await dataset.exists();
    if (!exists) {
        await bq.createDataset(DATASET_ID, { location: LOCATION });
        console.log(`[OK] Dataset created: ${DATASET_ID}`);
    } else {
        console.log(`[OK] Dataset exists: ${DATASET_ID}`);
    }
    return dataset;
}

async function createTableIfNotExists(dataset, tableDef) {
    const table = dataset.table(tableDef.id);
    const [exists] = await table.exists();
    if (exists) {
        console.log(`[SKIP] Table already exists: ${tableDef.id}`);
        return;
    }
    await dataset.createTable(tableDef.id, { schema: tableDef.schema });
    console.log(`[CREATED] ${tableDef.id} — ${tableDef.description}`);
}

async function main() {
    console.log(`Project: ${PROJECT_ID} / Dataset: ${DATASET_ID}`);
    console.log('');

    const dataset = await ensureDataset();

    for (const tableDef of TABLES) {
        try {
            await createTableIfNotExists(dataset, tableDef);
        } catch (err) {
            console.error(`[ERROR] ${tableDef.id}:`, err.message);
        }
    }

    console.log('');
    console.log('Done.');
}

main().catch(console.error);
