/**
 * BigQueryService.ts (v5)
 * thinktank.vault テーブルに対する CRUD サービス
 * vault_id フィールド廃止済み。MERGE 文 Upsert + 並列更新エラー自動リトライ
 */

import { BigQuery } from '@google-cloud/bigquery';

const DATASET_ID = 'thinktank';
const TABLE_ID   = 'vault';
const HISTORY_TABLE_ID = 'vault_history';

export interface VaultRecord {
  file_id:     string;
  file_type:   string;        // 固定値 "md"
  category:    string;        // ContentType (memo/thought/tables/links/chat/nettext)
  title:       string | null;
  content:     string | null; // タイトル行以降の本文
  keywords:    string | null;
  related_ids: string | null;
  size_bytes:  number | null;
  is_deleted:  boolean;
  created_at:  string;
  updated_at:  string;
}

export interface VaultHistoryRecord {
  history_id:   string;
  file_id:      string;
  timestamp:    string;
  title:        string | null;
  content:      string | null;
  category:     string;
  summary:      string | null;
}

type BqResult<T = VaultRecord[]> = { success: true; data: T } | { success: false; error: string };

export class BigQueryService {
  private bigquery: BigQuery | null = null;
  private projectId: string | undefined;

  async initialize(): Promise<boolean> {
    try {
      const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      if (!credentials) {
        console.error('[BigQueryService] GOOGLE_SERVICE_ACCOUNT_KEY not set');
        return false;
      }
      const keyFile = JSON.parse(credentials);
      this.projectId = keyFile.project_id as string | undefined;
      this.bigquery = new BigQuery({ projectId: this.projectId, credentials: keyFile });
      await this.ensureTableExists();
      await this.ensureHistoryTableExists();
      console.log(`[BigQueryService] Initialized (project: ${this.projectId}, table: ${DATASET_ID}.${TABLE_ID})`);
      return true;
    } catch (error) {
      console.error('[BigQueryService] Initialization failed:', error);
      return false;
    }
  }

  getBigQuery(): BigQuery | null { return this.bigquery; }
  getProjectId(): string | undefined { return this.projectId; }

  private get tbl(): string {
    return `\`${this.projectId}.${DATASET_ID}.${TABLE_ID}\``;
  }

  private get historyTbl(): string {
    return `\`${this.projectId}.${DATASET_ID}.${HISTORY_TABLE_ID}\``;
  }

  private async ensureHistoryTableExists(): Promise<void> {
    if (!this.bigquery) return;
    const dataset = this.bigquery.dataset(DATASET_ID);
    const table   = dataset.table(HISTORY_TABLE_ID);
    const [exists] = await table.exists();
    if (exists) {
      console.log(`[BigQueryService] Table ${DATASET_ID}.${HISTORY_TABLE_ID} confirmed`);
      return;
    }

    const [dsExists] = await dataset.exists();
    if (!dsExists) {
      await this.bigquery.createDataset(DATASET_ID, { location: 'asia-northeast1' });
    }
    await dataset.createTable(HISTORY_TABLE_ID, {
      schema: [
        { name: 'history_id',   type: 'STRING',    mode: 'REQUIRED' },
        { name: 'file_id',      type: 'STRING',    mode: 'REQUIRED' },
        { name: 'timestamp',    type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'title',        type: 'STRING',    mode: 'NULLABLE' },
        { name: 'content',      type: 'STRING',    mode: 'NULLABLE' },
        { name: 'category',     type: 'STRING',    mode: 'REQUIRED' },
        { name: 'summary',      type: 'STRING',    mode: 'NULLABLE' },
      ],
      clustering: { fields: ['file_id'] },
    });
    console.log(`[BigQueryService] Created table ${DATASET_ID}.${HISTORY_TABLE_ID}`);
  }

  private async ensureTableExists(): Promise<void> {
    if (!this.bigquery) return;
    const dataset = this.bigquery.dataset(DATASET_ID);
    const table   = dataset.table(TABLE_ID);
    const [exists] = await table.exists();
    if (exists) {
      console.log(`[BigQueryService] Table ${DATASET_ID}.${TABLE_ID} confirmed`);
      return;
    }

    const [dsExists] = await dataset.exists();
    if (!dsExists) {
      await this.bigquery.createDataset(DATASET_ID, { location: 'asia-northeast1' });
    }
    await dataset.createTable(TABLE_ID, {
      schema: [
        { name: 'file_id',     type: 'STRING',    mode: 'REQUIRED' },
        { name: 'file_type',   type: 'STRING',    mode: 'REQUIRED' },
        { name: 'category',    type: 'STRING',    mode: 'NULLABLE' },
        { name: 'title',       type: 'STRING',    mode: 'NULLABLE' },
        { name: 'content',     type: 'STRING',    mode: 'NULLABLE' },
        { name: 'keywords',    type: 'STRING',    mode: 'NULLABLE' },
        { name: 'related_ids', type: 'STRING',    mode: 'NULLABLE' },
        { name: 'size_bytes',  type: 'INT64',     mode: 'NULLABLE' },
        { name: 'is_deleted',  type: 'BOOL',      mode: 'NULLABLE' },
        { name: 'created_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'updated_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
      ],
      clustering: { fields: ['category'] },
    });
    console.log(`[BigQueryService] Created table ${DATASET_ID}.${TABLE_ID}`);
  }

  // ── メタ一覧（content なし）──────────────────────────────────────────

  async listMeta(): Promise<BqResult> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT t.file_id, t.file_type, t.category, t.title,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at
        FROM ${this.tbl} t
        INNER JOIN (
          SELECT file_id, MAX(updated_at) AS max_upd
          FROM ${this.tbl}
          WHERE COALESCE(is_deleted, FALSE) = FALSE
          GROUP BY file_id
        ) latest ON t.file_id = latest.file_id AND t.updated_at = latest.max_upd
        WHERE COALESCE(t.is_deleted, FALSE) = FALSE
        ORDER BY t.updated_at DESC
      `;
      const [rows] = await this.bigquery.query({ query });
      return { success: true, data: rows as VaultRecord[] };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── content のみ取得 ────────────────────────────────────────────────

  async getContent(fileId: string): Promise<BqResult<string | null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT content FROM ${this.tbl}
        WHERE file_id = @fileId
        ORDER BY updated_at DESC LIMIT 1
      `;
      const [rows] = await this.bigquery.query({ query, params: { fileId } });
      const row = (rows as Array<{ content: string | null }>)[0];
      return { success: true, data: row?.content ?? null };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── Upsert（MERGE） ─────────────────────────────────────────────────

  async save(record: VaultRecord, retries = 3): Promise<BqResult<null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        MERGE ${this.tbl} AS target
        USING (
          SELECT @file_id AS file_id, @file_type AS file_type,
                 @category AS category,
                 @title AS title, @content AS content,
                 @keywords AS keywords, @related_ids AS related_ids,
                 @size_bytes AS size_bytes,
                 @is_deleted AS is_deleted,
                 @created_at AS created_at, @updated_at AS updated_at
        ) AS source ON target.file_id = source.file_id
        WHEN MATCHED THEN UPDATE SET
          target.category    = source.category,
          target.title       = source.title,
          target.content     = source.content,
          target.keywords    = source.keywords,
          target.related_ids = source.related_ids,
          target.size_bytes  = source.size_bytes,
          target.is_deleted  = source.is_deleted,
          target.updated_at  = source.updated_at
        WHEN NOT MATCHED THEN INSERT
          (file_id, file_type, category, title, content,
           keywords, related_ids, size_bytes, is_deleted, created_at, updated_at)
        VALUES
          (source.file_id, source.file_type, source.category,
           source.title, source.content, source.keywords, source.related_ids,
           source.size_bytes, source.is_deleted, source.created_at, source.updated_at)
      `;
      const params = {
        file_id:     record.file_id,
        file_type:   record.file_type,
        category:    record.category,
        title:       record.title,
        content:     record.content,
        keywords:    record.keywords,
        related_ids: record.related_ids,
        size_bytes:  record.size_bytes,
        is_deleted:  record.is_deleted ?? false,
        created_at:  new Date(record.created_at),
        updated_at:  new Date(record.updated_at),
      };
      const types = {
        file_id: 'STRING', file_type: 'STRING', category: 'STRING',
        title: 'STRING', content: 'STRING', keywords: 'STRING', related_ids: 'STRING',
        size_bytes: 'INT64', is_deleted: 'BOOL',
        created_at: 'TIMESTAMP', updated_at: 'TIMESTAMP',
      };
      await this.bigquery.query({ query, params, types });
      return { success: true, data: null };
    } catch (error) {
      const err = error as { errors?: Array<{ reason: string }>; message?: string };
      const isConcurrent = err?.errors?.[0]?.reason === 'invalidQuery' &&
        String(err?.message).includes('concurrent update');
      if (isConcurrent && retries > 0) {
        const delay = (4 - retries) * 2000;
        await new Promise(r => setTimeout(r, delay));
        return this.save(record, retries - 1);
      }
      return { success: false, error: String(error) };
    }
  }

  // ── 履歴メタ一覧（content なし）────────────────────────────────────────
  async listHistoryMeta(thinkId: string): Promise<BqResult<VaultHistoryRecord[]>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT history_id, file_id, timestamp, title, category, summary
        FROM ${this.historyTbl}
        WHERE file_id = @thinkId
        ORDER BY timestamp DESC
      `;
      const [rows] = await this.bigquery.query({ query, params: { thinkId } });
      return { success: true, data: rows as VaultHistoryRecord[] };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 履歴本文取得 ──────────────────────────────────────────────────────
  async getHistoryContent(historyId: string): Promise<BqResult<string | null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT content FROM ${this.historyTbl}
        WHERE history_id = @historyId
        LIMIT 1
      `;
      const [rows] = await this.bigquery.query({ query, params: { historyId } });
      const row = (rows as Array<{ content: string | null }>)[0];
      return { success: true, data: row?.content ?? null };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 履歴保存（MERGE） ─────────────────────────────────────────────────
  async saveHistory(record: VaultHistoryRecord): Promise<BqResult<null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        MERGE ${this.historyTbl} AS target
        USING (
          SELECT @history_id AS history_id, @file_id AS file_id,
                 @timestamp AS timestamp, @title AS title,
                 @content AS content, @category AS category,
                 @summary AS summary
        ) AS source ON target.history_id = source.history_id
        WHEN MATCHED THEN UPDATE SET
          target.title     = source.title,
          target.content   = source.content,
          target.category  = source.category,
          target.summary   = source.summary
        WHEN NOT MATCHED THEN INSERT
          (history_id, file_id, timestamp, title, content, category, summary)
        VALUES
          (source.history_id, source.file_id, source.timestamp,
           source.title, source.content, source.category, source.summary)
      `;
      const params = {
        history_id:  record.history_id,
        file_id:     record.file_id,
        timestamp:   new Date(record.timestamp),
        title:       record.title,
        content:     record.content,
        category:    record.category,
        summary:     record.summary,
      };
      const types = {
        history_id: 'STRING', file_id: 'STRING', timestamp: 'TIMESTAMP',
        title: 'STRING', content: 'STRING', category: 'STRING', summary: 'STRING',
      };
      await this.bigquery.query({ query, params, types });
      return { success: true, data: null };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 削除（論理削除） ───────────────────────────────────────────────

  async delete(fileId: string): Promise<BqResult<null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const now = new Date().toISOString();
      const getResult = await this.getContent(fileId);
      const row: VaultRecord = {
        file_id: fileId, file_type: 'md',
        category: '', title: null, content: getResult.success ? getResult.data : null,
        keywords: null, related_ids: null, size_bytes: null,
        is_deleted: true, created_at: now, updated_at: now,
      };
      return await this.save(row);
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 全文検索 ─────────────────────────────────────────────────────────

  async search(q: string): Promise<BqResult> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT t.file_id, t.file_type, t.category, t.title,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at
        FROM ${this.tbl} t
        INNER JOIN (
          SELECT file_id, MAX(updated_at) AS max_upd
          FROM ${this.tbl}
          WHERE COALESCE(is_deleted, FALSE) = FALSE
          GROUP BY file_id
        ) latest ON t.file_id = latest.file_id AND t.updated_at = latest.max_upd
        WHERE COALESCE(t.is_deleted, FALSE) = FALSE
          AND CONTAINS_SUBSTR(CONCAT(COALESCE(t.title,''), ' ', COALESCE(t.content,'')), @q)
        ORDER BY t.updated_at DESC LIMIT 200
      `;
      const [rows] = await this.bigquery.query({ query, params: { q } });
      return { success: true, data: rows as VaultRecord[] };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}

export const bigqueryService = new BigQueryService();
