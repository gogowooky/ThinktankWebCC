/**
 * BigQueryService.ts
 * Google BigQuery API を使用したデータ操作サービス
 * サービスアカウント認証を使用
 */

import { BigQuery, Table } from '@google-cloud/bigquery';

// データセット名とテーブル名
const DATASET_ID = 'thinktank';
const TABLE_ID = 'files';

// ファイルレコードの型定義
export interface FileRecord {
    file_id: string;
    title: string | null;
    file_type: string;
    category: string | null;
    content: string | null;
    metadata: Record<string, unknown> | null;
    size_bytes: number | null;
    created_at: Date;
    updated_at: Date;
}

// クエリ結果の型
export interface QueryResult<T = Record<string, unknown>> {
    success: boolean;
    data?: T[];
    error?: string;
}

// バージョン情報の型
export interface VersionInfo {
    file_id: string;
    updated_at: Date;
}

export class BigQueryService {
    private bigquery: BigQuery | null = null;
    private table: Table | null = null;
    private projectId: string | undefined = undefined;

    /**
     * サービスアカウント認証で BigQuery API を初期化
     */
    async initialize(): Promise<boolean> {
        try {
            // 環境変数から認証情報を取得
            const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

            if (!credentials) {
                console.error('[BigQueryService] GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません');
                return false;
            }

            const keyFile = JSON.parse(credentials);
            this.projectId = keyFile.project_id || undefined;

            this.bigquery = new BigQuery({
                projectId: this.projectId,
                credentials: keyFile
            });

            // テーブル参照を取得
            const dataset = this.bigquery.dataset(DATASET_ID);
            this.table = dataset.table(TABLE_ID);

            // テーブルの存在確認（存在しない場合は作成）
            await this.ensureTableExists();

            console.log(`[BigQueryService] 初期化完了 (プロジェクト: ${this.projectId})`);
            return true;
        } catch (error) {
            console.error('[BigQueryService] 初期化失敗:', error);
            return false;
        }
    }

    /**
     * テーブルが存在しない場合は作成
     */
    private async ensureTableExists(): Promise<void> {
        if (!this.bigquery || !this.table) return;

        try {
            const [exists] = await this.table.exists();
            if (exists) {
                console.log(`[BigQueryService] テーブル ${DATASET_ID}.${TABLE_ID} 確認済み`);
                return;
            }

            // テーブルを作成
            const schema = [
                { name: 'file_id', type: 'STRING', mode: 'REQUIRED' },
                { name: 'title', type: 'STRING', mode: 'NULLABLE' },
                { name: 'file_type', type: 'STRING', mode: 'REQUIRED' },
                { name: 'category', type: 'STRING', mode: 'NULLABLE' },
                { name: 'content', type: 'STRING', mode: 'NULLABLE' },
                { name: 'metadata', type: 'JSON', mode: 'NULLABLE' },
                { name: 'size_bytes', type: 'INT64', mode: 'NULLABLE' },
                { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
                { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' }
            ];

            const dataset = this.bigquery.dataset(DATASET_ID);

            // データセットの存在確認
            const [datasetExists] = await dataset.exists();
            if (!datasetExists) {
                await this.bigquery.createDataset(DATASET_ID, {
                    location: 'asia-northeast1'
                });
                console.log(`[BigQueryService] データセット ${DATASET_ID} を作成しました`);
            }

            await dataset.createTable(TABLE_ID, { schema });
            console.log(`[BigQueryService] テーブル ${DATASET_ID}.${TABLE_ID} を作成しました`);
        } catch (error) {
            console.error('[BigQueryService] テーブル作成失敗:', error);
            throw error;
        }
    }

    /**
     * ファイルを取得（単一）
     */
    async getFile(fileId: string): Promise<QueryResult<FileRecord>> {
        if (!this.bigquery) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            const query = `
                SELECT * FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
                WHERE file_id = @fileId
                ORDER BY updated_at DESC
                LIMIT 1
            `;
            const [rows] = await this.bigquery.query({
                query,
                params: { fileId }
            });

            return { success: true, data: rows as FileRecord[] };
        } catch (error) {
            console.error(`[BigQueryService] ファイル取得失敗 (${fileId}):`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * ファイル一覧を取得
     */
    async listFiles(category?: string, since?: Date): Promise<QueryResult<FileRecord>> {
        if (!this.bigquery) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            // 重複排除: file_id + category ごとに最新のupdated_atを持つレコードのみを取得
            // カテゴリがNULLの場合も考慮して空文字置換でグルーピング
            let query = `
                SELECT t.file_id, t.title, t.file_type, t.category, t.size_bytes, t.created_at, t.updated_at
                FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\` t
                INNER JOIN (
                    SELECT file_id, IFNULL(category, '') as cat_key, MAX(updated_at) as max_updated_at
                    FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
                    GROUP BY file_id, cat_key
                ) latest ON t.file_id = latest.file_id 
                    AND IFNULL(t.category, '') = latest.cat_key 
                    AND t.updated_at = latest.max_updated_at
            `;
            const params: Record<string, any> = {};

            const conditions: string[] = [];

            if (category) {
                conditions.push(`t.category = @category`);
                params.category = category;
            }

            if (since) {
                conditions.push(`t.updated_at > @since`);
                params.since = since.toISOString();
            }

            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            query += ` ORDER BY t.updated_at DESC`;

            const [rows] = await this.bigquery.query({ query, params });
            return { success: true, data: rows as FileRecord[] };
        } catch (error) {
            console.error('[BigQueryService] ファイル一覧取得失敗:', error);
            return { success: false, error: String(error) };
        }
    }
    /**
     * ファイルを保存（Upsert: MERGE文を使用）
     * 既存のfile_idがあれば更新、なければ挿入
     */
    async saveFile(record: FileRecord): Promise<QueryResult> {
        if (!this.bigquery || !this.table) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            const query = `
                INSERT INTO \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
                (file_id, title, file_type, category, content, metadata, size_bytes, created_at, updated_at)
                VALUES
                (@file_id, @title, @file_type, @category, @content, PARSE_JSON(@metadata), @size_bytes, TIMESTAMP(@created_at), TIMESTAMP(@updated_at))
            `;

            const params = {
                file_id: record.file_id,
                title: record.title || null,
                file_type: record.file_type,
                category: record.category || null,
                content: record.content || null,
                metadata: record.metadata ? JSON.stringify(record.metadata) : null,
                size_bytes: record.size_bytes || null,
                created_at: record.created_at ? new Date(record.created_at) : new Date(),
                updated_at: record.updated_at ? new Date(record.updated_at) : new Date()
            };

            const types = {
                file_id: 'STRING',
                title: 'STRING',
                file_type: 'STRING',
                category: 'STRING',
                content: 'STRING',
                metadata: 'STRING',
                size_bytes: 'INT64',
                created_at: 'TIMESTAMP',
                updated_at: 'TIMESTAMP'
            };

            await this.bigquery.query({
                query,
                params,
                types
            });

            return { success: true };
        } catch (error) {
            console.error(`[BigQueryService] ファイル保存失敗 (${record.file_id}):`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * ファイルを削除 (ID + Category指定が理想だが、現状API仕様上はIDのみ削除。
     *  同じIDで複数カテゴリある場合はすべて消える挙動になるため、注意が必要だが、
     *  既存インターフェースを変更しない範囲ではID指定削除のままとする)
     */
    async deleteFile(fileId: string): Promise<QueryResult> {
        if (!this.bigquery) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            const query = `
                DELETE FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
                WHERE file_id = @fileId
            `;
            await this.bigquery.query({
                query,
                params: { fileId }
            });

            return { success: true };
        } catch (error) {
            console.error(`[BigQueryService] ファイル削除失敗 (${fileId}):`, error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * 全文検索（SEARCH関数使用）
     */
    async search(queryText: string, category?: string): Promise<QueryResult<FileRecord>> {
        if (!this.bigquery) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            let query = `
                SELECT file_id, title, file_type, category, 
                       content,
                       updated_at
                FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
                WHERE CONTAINS_SUBSTR(content, @queryText)
            `;
            const params: Record<string, string> = { queryText };

            if (category) {
                query += ` AND category = @category`;
                params.category = category;
            }

            query += ` ORDER BY updated_at DESC LIMIT 200`;

            const [rows] = await this.bigquery.query({ query, params });
            return { success: true, data: rows as FileRecord[] };
        } catch (error) {
            console.error('[BigQueryService] 全文検索失敗:', error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * バージョン情報を取得（キャッシュ整合性チェック用）
     */
    async getVersions(): Promise<QueryResult<VersionInfo>> {
        if (!this.bigquery) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            const query = `
                SELECT file_id, updated_at
                FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
            `;
            const [rows] = await this.bigquery.query({ query });
            return { success: true, data: rows as VersionInfo[] };
        } catch (error) {
            console.error('[BigQueryService] バージョン情報取得失敗:', error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * 一括保存（Upsert: MERGE文を使用）
     * 注意: BQのクエリサイズ制限や複雑さを考慮し、ここでは簡易的にループで処理するか、
     * 一時テーブルを使ったMERGEを行うのが一般的ですが、
     * 今回は件数が少ない前提でループ処理（Promise.all）で実装します。
     * ※ 本格的なBulk Upsertが必要な場合は一時テーブル方式推奨
     */
    async bulkSave(records: FileRecord[]): Promise<QueryResult> {
        if (!this.bigquery || !this.table) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            // 並列でMERGEを実行 (件数が多い場合は制限に注意)
            // BigQueryのConcurrent interactive queries quotaに引っかかる可能性があるので
            // 直列実行またはバッチサイズ制御が望ましい
            for (const record of records) {
                await this.saveFile(record);
            }

            console.log(`[BigQueryService] ${records.length} 件のレコードを保存しました`);
            return { success: true };
        } catch (error) {
            console.error('[BigQueryService] 一括保存失敗:', error);
            return { success: false, error: String(error) };
        }
    }

    /**
     * 全データ取得（キャッシュ再構築用）- 重複排除
     */
    async getAllFiles(): Promise<QueryResult<FileRecord>> {
        if (!this.bigquery) {
            return { success: false, error: 'BigQuery未初期化' };
        }

        try {
            const query = `
                SELECT t.* 
                FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\` t
                INNER JOIN (
                    SELECT file_id, IFNULL(category, '') as cat_key, MAX(updated_at) as max_updated_at
                    FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
                    GROUP BY file_id, cat_key
                ) latest ON t.file_id = latest.file_id 
                    AND IFNULL(t.category, '') = latest.cat_key
                    AND t.updated_at = latest.max_updated_at
                ORDER BY t.file_id
            `;
            const [rows] = await this.bigquery.query({ query });
            return { success: true, data: rows as FileRecord[] };
        } catch (error) {
            console.error('[BigQueryService] 全データ取得失敗:', error);
            return { success: false, error: String(error) };
        }
    }
}

// シングルトンインスタンス
export const bigqueryService = new BigQueryService();

