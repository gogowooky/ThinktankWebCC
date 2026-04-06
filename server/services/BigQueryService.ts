/**
 * BigQueryService.ts
 * Google BigQuery API を使用したデータ操作サービス
 *
 * データセット: thinktank
 * テーブル: files
 * キー: (file_id, category) - MERGE文によるUpsert
 *
 * 重要: 既存データの削除・上書きを行わない安全設計
 * - DELETE/DROP/TRUNCATE は deleteFile() のみ（明示的な単一レコード削除）
 * - テーブル作成は存在しない場合のみ（既存テーブルは変更しない）
 */

import { BigQuery, Table } from '@google-cloud/bigquery';

const DATASET_ID = 'thinktank';
const TABLE_ID = 'files';

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

export interface QueryResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T[];
  error?: string;
}

export interface VersionInfo {
  file_id: string;
  updated_at: Date;
}

export class BigQueryService {
  private bigquery: BigQuery | null = null;
  private table: Table | null = null;
  private projectId: string | undefined = undefined;

  async initialize(): Promise<boolean> {
    try {
      const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      if (!credentials) {
        console.error('[BigQueryService] GOOGLE_SERVICE_ACCOUNT_KEY not set');
        return false;
      }

      const keyFile = JSON.parse(credentials);
      this.projectId = keyFile.project_id || undefined;

      this.bigquery = new BigQuery({
        projectId: this.projectId,
        credentials: keyFile,
      });

      const dataset = this.bigquery.dataset(DATASET_ID);
      this.table = dataset.table(TABLE_ID);

      await this.ensureTableExists();

      console.log(`[BigQueryService] Initialized (project: ${this.projectId})`);
      return true;
    } catch (error) {
      console.error('[BigQueryService] Initialization failed:', error);
      return false;
    }
  }

  private async ensureTableExists(): Promise<void> {
    if (!this.bigquery || !this.table) return;

    const [exists] = await this.table.exists();
    if (exists) {
      console.log(`[BigQueryService] Table ${DATASET_ID}.${TABLE_ID} confirmed`);
      return;
    }

    const schema = [
      { name: 'file_id', type: 'STRING', mode: 'REQUIRED' as const },
      { name: 'title', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'file_type', type: 'STRING', mode: 'REQUIRED' as const },
      { name: 'category', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'content', type: 'STRING', mode: 'NULLABLE' as const },
      { name: 'metadata', type: 'JSON', mode: 'NULLABLE' as const },
      { name: 'size_bytes', type: 'INT64', mode: 'NULLABLE' as const },
      { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
      { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' as const },
    ];

    const dataset = this.bigquery.dataset(DATASET_ID);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) {
      await this.bigquery.createDataset(DATASET_ID, { location: 'asia-northeast1' });
      console.log(`[BigQueryService] Created dataset ${DATASET_ID}`);
    }

    await dataset.createTable(TABLE_ID, {
      schema,
      clustering: { fields: ['category'] },
    });
    console.log(`[BigQueryService] Created table ${DATASET_ID}.${TABLE_ID}`);
  }

  async getFile(fileId: string): Promise<QueryResult<FileRecord>> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };

    try {
      const query = `
        SELECT * FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
        WHERE file_id = @fileId
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      const [rows] = await this.bigquery.query({ query, params: { fileId } });
      return { success: true, data: rows as FileRecord[] };
    } catch (error) {
      console.error(`[BigQueryService] getFile failed (${fileId}):`, error);
      return { success: false, error: String(error) };
    }
  }

  async listFiles(category?: string, since?: Date): Promise<QueryResult<FileRecord>> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };

    try {
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
      const params: Record<string, string> = {};
      const conditions: string[] = [];

      if (category) {
        conditions.push('t.category = @category');
        params.category = category;
      }
      if (since) {
        conditions.push('t.updated_at > @since');
        params.since = since.toISOString();
      }
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ' ORDER BY t.updated_at DESC';

      const [rows] = await this.bigquery.query({ query, params });
      return { success: true, data: rows as FileRecord[] };
    } catch (error) {
      console.error('[BigQueryService] listFiles failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * カテゴリ別に全データ（content付き）を重複排除して取得
   */
  async listFilesFull(category: string): Promise<QueryResult<FileRecord>> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };

    try {
      const query = `
        SELECT t.*
        FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\` t
        INNER JOIN (
          SELECT file_id, IFNULL(category, '') as cat_key, MAX(updated_at) as max_updated_at
          FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
          WHERE category = @category
          GROUP BY file_id, cat_key
        ) latest ON t.file_id = latest.file_id
          AND IFNULL(t.category, '') = latest.cat_key
          AND t.updated_at = latest.max_updated_at
        WHERE t.category = @category
        ORDER BY t.updated_at DESC
      `;
      const [rows] = await this.bigquery.query({ query, params: { category } });
      return { success: true, data: rows as FileRecord[] };
    } catch (error) {
      console.error('[BigQueryService] listFilesFull failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * MERGE-based upsert on (file_id, category) key.
   * Existing records are updated, new records are inserted.
   * created_at is preserved on update.
   */
  async saveFile(record: FileRecord, retries = 3): Promise<QueryResult> {
    if (!this.bigquery || !this.table) return { success: false, error: 'BigQuery not initialized' };

    try {
      const query = `
        MERGE \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\` AS target
        USING (
          SELECT
            @file_id AS file_id,
            @title AS title,
            @file_type AS file_type,
            @category AS category,
            @content AS content,
            IF(@metadata IS NULL, NULL, PARSE_JSON(@metadata)) AS metadata,
            @size_bytes AS size_bytes,
            @created_at AS created_at,
            @updated_at AS updated_at
        ) AS source
        ON target.file_id = source.file_id
           AND IFNULL(target.category, '') = IFNULL(source.category, '')
        WHEN MATCHED THEN
          UPDATE SET
            target.title = source.title,
            target.file_type = source.file_type,
            target.content = source.content,
            target.metadata = source.metadata,
            target.size_bytes = source.size_bytes,
            target.updated_at = source.updated_at
        WHEN NOT MATCHED THEN
          INSERT (file_id, title, file_type, category, content, metadata, size_bytes, created_at, updated_at)
          VALUES (source.file_id, source.title, source.file_type, source.category, source.content, source.metadata, source.size_bytes, source.created_at, source.updated_at)
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
        updated_at: record.updated_at ? new Date(record.updated_at) : new Date(),
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
        updated_at: 'TIMESTAMP',
      };

      await this.bigquery.query({ query, params, types });
      return { success: true };
    } catch (error: unknown) {
      const err = error as { errors?: { reason?: string }[]; message?: string };
      const isConcurrentError =
        err?.errors?.[0]?.reason === 'invalidQuery' &&
        String(err?.message).includes('concurrent update');

      if (isConcurrentError && retries > 0) {
        const delayMs = (4 - retries) * 2000;
        console.warn(`[BigQueryService] Concurrent update conflict (${record.file_id}), retrying in ${delayMs}ms (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.saveFile(record, retries - 1);
      }

      console.error(`[BigQueryService] saveFile failed (${record.file_id}):`, error);
      return { success: false, error: String(error) };
    }
  }

  async deleteFile(fileId: string): Promise<QueryResult> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };

    try {
      const query = `
        DELETE FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
        WHERE file_id = @fileId
      `;
      await this.bigquery.query({ query, params: { fileId } });
      return { success: true };
    } catch (error) {
      console.error(`[BigQueryService] deleteFile failed (${fileId}):`, error);
      return { success: false, error: String(error) };
    }
  }

  async search(queryText: string, category?: string): Promise<QueryResult<FileRecord>> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };

    try {
      let query = `
        SELECT file_id, title, file_type, category, content, updated_at
        FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
        WHERE CONTAINS_SUBSTR(content, @queryText)
      `;
      const params: Record<string, string> = { queryText };

      if (category) {
        query += ' AND category = @category';
        params.category = category;
      } else {
        query += ` AND category = 'Memo'`;
      }

      query += ' QUALIFY ROW_NUMBER() OVER (PARTITION BY file_id ORDER BY updated_at DESC) = 1';
      query += ' ORDER BY updated_at DESC LIMIT 200';

      const [rows] = await this.bigquery.query({ query, params });
      return { success: true, data: rows as FileRecord[] };
    } catch (error) {
      console.error('[BigQueryService] search failed:', error);
      return { success: false, error: String(error) };
    }
  }

  async getVersions(category?: string): Promise<QueryResult<VersionInfo>> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };

    try {
      let query: string;
      const params: Record<string, string> = {};

      if (category) {
        query = `
          SELECT file_id, MAX(updated_at) as updated_at
          FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
          WHERE category = @category
          GROUP BY file_id
          ORDER BY updated_at DESC
        `;
        params.category = category;
      } else {
        query = `
          SELECT file_id, MAX(updated_at) as updated_at
          FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
          GROUP BY file_id
          ORDER BY updated_at DESC
        `;
      }
      const [rows] = await this.bigquery.query({ query, params });
      return { success: true, data: rows as VersionInfo[] };
    } catch (error) {
      console.error('[BigQueryService] getVersions failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * 複数file_idを指定してcontent付きレコードを一括取得（差分同期用）
   */
  async getFilesByIds(fileIds: string[], category?: string): Promise<QueryResult<FileRecord>> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };
    if (fileIds.length === 0) return { success: true, data: [] };

    try {
      let whereClause = 't.file_id IN UNNEST(@fileIds)';
      const params: Record<string, unknown> = { fileIds };
      if (category) {
        whereClause += ' AND t.category = @category';
        params.category = category;
      }

      const query = `
        SELECT t.*
        FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\` t
        INNER JOIN (
          SELECT file_id, IFNULL(category, '') as cat_key, MAX(updated_at) as max_updated_at
          FROM \`${this.projectId}.${DATASET_ID}.${TABLE_ID}\`
          WHERE file_id IN UNNEST(@fileIds)
          ${category ? 'AND category = @category' : ''}
          GROUP BY file_id, cat_key
        ) latest ON t.file_id = latest.file_id
          AND IFNULL(t.category, '') = latest.cat_key
          AND t.updated_at = latest.max_updated_at
        WHERE ${whereClause}
        ORDER BY t.updated_at DESC
      `;
      const [rows] = await this.bigquery.query({ query, params });
      return { success: true, data: rows as FileRecord[] };
    } catch (error) {
      console.error('[BigQueryService] getFilesByIds failed:', error);
      return { success: false, error: String(error) };
    }
  }

  async getAllFiles(): Promise<QueryResult<FileRecord>> {
    if (!this.bigquery) return { success: false, error: 'BigQuery not initialized' };

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
      console.error('[BigQueryService] getAllFiles failed:', error);
      return { success: false, error: String(error) };
    }
  }

  async bulkSave(records: FileRecord[]): Promise<QueryResult> {
    if (!this.bigquery || !this.table) return { success: false, error: 'BigQuery not initialized' };

    try {
      for (const record of records) {
        await this.saveFile(record);
      }
      console.log(`[BigQueryService] Bulk saved ${records.length} records`);
      return { success: true };
    } catch (error) {
      console.error('[BigQueryService] bulkSave failed:', error);
      return { success: false, error: String(error) };
    }
  }
}

export const bigqueryService = new BigQueryService();
