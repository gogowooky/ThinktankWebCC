/**
 * BigQueryService.ts (v5)
 * thinktank.vault テーブルに対する CRUD サービス
 * vault_id フィールド廃止済み。MERGE 文 Upsert + 並列更新エラー自動リトライ
 */

import { BigQuery } from '@google-cloud/bigquery';
import { validateVaultKey } from './vaultKey.js';

const DATASET_ID = 'thinktank';
const TABLE_ID   = 'vault';

export interface VaultRecord {
  file_id:     string;
  file_type:   string;        // 固定値 "md"
  category:    string;        // ContentType (memo/bundle/tables/links/chat/nettext)
  title:       string | null;  // 全テキストの1行目。クライアントの TTThink.Content はこれと content を連結したもの
  content:     string | null;  // 本文のみ（タイトル行を含まない）。BigQuery の列名なのでフィールド名は変えない
  keywords:    string | null;
  related_ids: string | null;
  size_bytes:  number | null;
  is_deleted:  boolean | null;
  created_at:  string | object;
  updated_at:  string | object;
  metadata?:   string | null;
}

function parseBqDate(d: string | object): Date {
  if (d instanceof Date) return d;
  if (typeof d === 'object' && d !== null && 'value' in d) {
    return new Date((d as { value: string }).value);
  }
  return new Date(String(d));
}

type BqResult<T = VaultRecord[]> = { success: true; data: T } | { success: false; error: string };

export class BigQueryService {
  private bigquery: BigQuery | null = null;
  private projectId: string | undefined;

  async initialize(): Promise<boolean> {
    try {
      // 鍵JSONが渡されていればそれを使い、無ければ ADC（Cloud Run のランタイム
      // サービスアカウント）にフォールバックする。コンテナには鍵ファイルを
      // 同梱しない（.dockerignore で除外）ため、公開環境では後者の経路になる。
      const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      if (credentials) {
        const keyFile = JSON.parse(credentials);
        this.bigquery = new BigQuery({ projectId: keyFile.project_id, credentials: keyFile });
      } else {
        this.bigquery = new BigQuery();
      }
      // ADC 経路では projectId がメタデータサーバー経由で遅延解決されるため、
      // tbl でテーブル名を組み立てる前に必ずクライアントから取得しておく
      this.projectId = await this.bigquery.getProjectId();
      await this.ensureTableExists();
      console.log(
        `[BigQueryService] Initialized (project: ${this.projectId}, table: ${DATASET_ID}.${TABLE_ID}` +
        `, auth: ${credentials ? 'service account key' : 'ADC'})`
      );
      return true;
    } catch (error) {
      console.error('[BigQueryService] Initialization failed:', error);
      return false;
    }
  }

  getBigQuery(): BigQuery | null { return this.bigquery; }
  getProjectId(): string | undefined { return this.projectId; }

  /** P2 updates metadata only. The version check and write share one transaction. */
  async saveThinkSupport(fileId: string, expectedVersion: string, metadata: object, updatedAt: string): Promise<BqResult<boolean>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const [table] = await this.bigquery.dataset(DATASET_ID).table(TABLE_ID).getMetadata();
      const type = table.schema?.fields?.find((f: { name?: string }) => f.name === 'metadata')?.type;
      if (type !== 'STRING' && type !== 'JSON') return { success: false, error: 'unsupported metadata column' };
      const [rows] = await this.bigquery.query({
        query: `DECLARE changed INT64;
          BEGIN TRANSACTION;
          UPDATE ${this.tbl} SET metadata = ${type === 'JSON' ? 'PARSE_JSON(@metadata)' : '@metadata'}, updated_at = TIMESTAMP(@updatedAt)
          WHERE file_id = @fileId AND category = 'bundle' AND COALESCE(is_deleted, FALSE) = FALSE
            AND updated_at = TIMESTAMP(@expectedVersion)
            AND (SELECT COUNT(*) FROM ${this.tbl} WHERE file_id = @fileId) = 1;
          SET changed = @@row_count;
          COMMIT TRANSACTION;
          SELECT changed;`,
        params: { fileId, expectedVersion, metadata: JSON.stringify(metadata), updatedAt },
        types: { fileId: 'STRING', expectedVersion: 'STRING', metadata: 'STRING', updatedAt: 'STRING' },
      });
      return { success: true, data: Number(rows[0]?.changed) === 1 };
    } catch (error) { return { success: false, error: String(error) }; }
  }

  /** Append structured AI conversation data to a Chat record with optimistic locking. */
  async saveChatConversation(fileId: string, expectedVersion: string, metadata: object, content: string, updatedAt: string): Promise<BqResult<boolean>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const [table] = await this.bigquery.dataset(DATASET_ID).table(TABLE_ID).getMetadata();
      const type = table.schema?.fields?.find((f: { name?: string }) => f.name === 'metadata')?.type;
      if (type !== 'STRING' && type !== 'JSON') return { success: false, error: 'unsupported metadata column' };
      const [rows] = await this.bigquery.query({
        query: `DECLARE changed INT64;
          BEGIN TRANSACTION;
          UPDATE ${this.tbl} SET metadata = ${type === 'JSON' ? 'PARSE_JSON(@metadata)' : '@metadata'},
            content = @content, size_bytes = @size, updated_at = TIMESTAMP(@updatedAt)
          WHERE file_id = @fileId AND category = 'chat' AND COALESCE(is_deleted, FALSE) = FALSE
            AND updated_at = TIMESTAMP(@expectedVersion)
            AND (SELECT COUNT(*) FROM ${this.tbl} WHERE file_id = @fileId) = 1;
          SET changed = @@row_count;
          COMMIT TRANSACTION;
          SELECT changed;`,
        params: { fileId, expectedVersion, metadata: JSON.stringify(metadata), content, size: Buffer.byteLength(content, 'utf8'), updatedAt },
        types: { fileId: 'STRING', expectedVersion: 'STRING', metadata: 'STRING', content: 'STRING', size: 'INT64', updatedAt: 'STRING' },
      });
      return { success: true, data: Number(rows[0]?.changed) === 1 };
    } catch (error) { return { success: false, error: String(error) }; }
  }

  private get tbl(): string {
    return `\`${this.projectId}.${DATASET_ID}.${TABLE_ID}\``;
  }

  /** Insertion and the applied marker commit together, so retries cannot create orphan artifacts. */
  async applyAgentArtifact(bundleId: string, expectedVersion: string, metadata: object, updatedAt: string,
    artifact: { thinkId: string; title: string; body: string; metadata: object }): Promise<BqResult<boolean>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    if (!validateVaultKey(bundleId, 'bundle').ok || !validateVaultKey(artifact.thinkId, 'memo').ok || bundleId === artifact.thinkId) return { success: false, error: 'invalid artifact id' };
    try {
      const [table] = await this.bigquery.dataset(DATASET_ID).table(TABLE_ID).getMetadata();
      const type = table.schema?.fields?.find((f: { name?: string }) => f.name === 'metadata')?.type;
      if (type !== 'STRING' && type !== 'JSON') return { success: false, error: 'unsupported metadata column' };
      const [rows] = await this.bigquery.query({
        query: `DECLARE changed INT64;
          BEGIN TRANSACTION;
          UPDATE ${this.tbl} SET metadata = ${type === 'JSON' ? 'PARSE_JSON(@metadata)' : '@metadata'}, updated_at = TIMESTAMP(@updatedAt)
          WHERE file_id = @bundleId AND category = 'bundle' AND COALESCE(is_deleted, FALSE) = FALSE
            AND updated_at = TIMESTAMP(@expectedVersion)
            AND (SELECT COUNT(*) FROM ${this.tbl} WHERE file_id = @bundleId) = 1
            AND NOT EXISTS (SELECT 1 FROM ${this.tbl} WHERE file_id = @artifactId);
          SET changed = @@row_count;
          IF changed = 1 THEN
            INSERT INTO ${this.tbl} (file_id, file_type, category, title, content, keywords, related_ids, size_bytes, is_deleted, created_at, updated_at, metadata)
            VALUES (@artifactId, 'md', 'memo', @title, @body, '', '', @size, FALSE, TIMESTAMP(@updatedAt), TIMESTAMP(@updatedAt), ${type === 'JSON' ? 'PARSE_JSON(@artifactMetadata)' : '@artifactMetadata'});
          END IF;
          COMMIT TRANSACTION;
          SELECT changed;`,
        params: { bundleId, expectedVersion, metadata: JSON.stringify(metadata), updatedAt, artifactId: artifact.thinkId,
          title: `# ${artifact.title}`, body: artifact.body, size: Buffer.byteLength(`# ${artifact.title}\n${artifact.body}`), artifactMetadata: JSON.stringify(artifact.metadata) },
        types: { bundleId: 'STRING', expectedVersion: 'STRING', metadata: 'STRING', updatedAt: 'STRING', artifactId: 'STRING', title: 'STRING', body: 'STRING', size: 'INT64', artifactMetadata: 'STRING' },
      });
      return { success: true, data: Number(rows[0]?.changed) === 1 };
    } catch (error) { return { success: false, error: String(error) }; }
  }

  private async ensureTableExists(): Promise<void> {
    if (!this.bigquery) return;
    const dataset = this.bigquery.dataset(DATASET_ID);
    const table   = dataset.table(TABLE_ID);
    const [exists] = await table.exists();
    if (exists) {
      console.log(`[BigQueryService] Table ${DATASET_ID}.${TABLE_ID} confirmed`);
      try {
        const [metaData] = await table.getMetadata();
        const fields = metaData.schema?.fields || [];
        const hasMetadata = fields.some((f: any) => f.name === 'metadata');
        if (!hasMetadata) {
          console.log(`[BigQueryService] Adding missing 'metadata' column...`);
          const newSchema = [
            ...fields,
            { name: 'metadata', type: 'STRING', mode: 'NULLABLE' }
          ];
          await table.setMetadata({ schema: newSchema });
          console.log(`[BigQueryService] 'metadata' column added successfully`);
        }
      } catch (err) {
        console.error(`[BigQueryService] Failed to update schema for 'metadata' column:`, err);
      }
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
        { name: 'metadata',    type: 'STRING',    mode: 'NULLABLE' },
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
               t.created_at, t.updated_at, t.metadata
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

  // ── 全件（コンテンツ含む）取得（エクスポート用） ────────────────────────
  async listAllWithContent(): Promise<BqResult> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT t.file_id, t.file_type, t.category, t.title, t.content,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at, t.metadata
        FROM ${this.tbl} t
        INNER JOIN (
          SELECT file_id, MAX(updated_at) AS max_upd
          FROM ${this.tbl}
          WHERE COALESCE(is_deleted, FALSE) = FALSE
          GROUP BY file_id
        ) latest ON t.file_id = latest.file_id AND t.updated_at = latest.max_upd
        WHERE COALESCE(t.is_deleted, FALSE) = FALSE
      `;
      const [rows] = await this.bigquery.query({ query });
      return { success: true, data: rows as VaultRecord[] };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 単一レコード取得（title/category/content を含む完全形） ──────────────

  async getRecord(fileId: string): Promise<BqResult<VaultRecord | null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT t.file_id, t.file_type, t.category, t.title, t.content,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at, t.metadata
        FROM ${this.tbl} t
        WHERE t.file_id = @fileId
          AND COALESCE(t.is_deleted, FALSE) = FALSE
        ORDER BY t.updated_at DESC LIMIT 1
      `;
      const [rows] = await this.bigquery.query({ query, params: { fileId } });
      return { success: true, data: (rows as VaultRecord[])[0] ?? null };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 本文のみ取得（タイトル行は title 列にあるので含まれない）──────────

  async getBody(fileId: string): Promise<BqResult<string | null>> {
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

  async save(record: VaultRecord, retries = 3, expectedVersion?: string): Promise<BqResult<null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };

    // 書き込み前の検証（PROJECT_REVIEW_REPORT.md D-5）。HTTP ルートと AI ツールの
    // 両方がここを通るため、不正な file_id / category はこの最下層で弾く。
    const keyCheck = validateVaultKey(record.file_id, record.category, {
      isDeleted: record.is_deleted === true,
    });
    if (!keyCheck.ok) return { success: false, error: keyCheck.error };

    try {
      const query = `${expectedVersion ? 'DECLARE changed INT64; BEGIN TRANSACTION;' : ''}
        MERGE ${this.tbl} AS target
        USING (
          SELECT @file_id AS file_id, @file_type AS file_type,
                 @category AS category,
                 @title AS title, @content AS content,
                 @keywords AS keywords, @related_ids AS related_ids,
                 @size_bytes AS size_bytes,
                 @is_deleted AS is_deleted,
                 @created_at AS created_at, @updated_at AS updated_at,
                 SAFE_CAST(@metadata AS JSON) AS metadata
        ) AS source ON target.file_id = source.file_id
        WHEN MATCHED ${expectedVersion ? 'AND target.updated_at = TIMESTAMP(@expectedVersion)' : ''} THEN UPDATE SET
          target.category    = source.category,
          target.title       = source.title,
          target.content     = source.content,
          target.keywords    = source.keywords,
          target.related_ids = source.related_ids,
          target.size_bytes  = source.size_bytes,
          target.is_deleted  = source.is_deleted,
          target.updated_at  = source.updated_at,
          target.metadata    = source.metadata
        WHEN NOT MATCHED ${expectedVersion ? 'AND FALSE' : ''} THEN INSERT
          (file_id, file_type, category, title, content,
           keywords, related_ids, size_bytes, is_deleted, created_at, updated_at, metadata)
        VALUES
          (source.file_id, source.file_type, source.category,
           source.title, source.content, source.keywords, source.related_ids,
           source.size_bytes, source.is_deleted, source.created_at, source.updated_at, source.metadata)
        ${expectedVersion ? ' ; SET changed = @@row_count; ASSERT changed <= 1 AS "duplicate file_id"; COMMIT TRANSACTION; SELECT changed;' : ''}
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
        created_at:  parseBqDate(record.created_at),
        updated_at:  parseBqDate(record.updated_at),
        metadata:    record.metadata ?? null,
        ...(expectedVersion ? { expectedVersion } : {}),
      };
      const types = {
        file_id: 'STRING', file_type: 'STRING', category: 'STRING',
        title: 'STRING', content: 'STRING', keywords: 'STRING', related_ids: 'STRING',
        size_bytes: 'INT64', is_deleted: 'BOOL',
        created_at: 'TIMESTAMP', updated_at: 'TIMESTAMP',
        metadata: 'JSON',
        ...(expectedVersion ? { expectedVersion: 'STRING' } : {}),
      };
      const [rows] = await this.bigquery.query({ query, params, types });
      if (expectedVersion && Number(rows[0]?.changed) !== 1) return { success: false, error: 'conflict' };
      return { success: true, data: null };
    } catch (error) {
      const err = error as { errors?: Array<{ reason: string }>; message?: string };
      const isConcurrent = err?.errors?.[0]?.reason === 'invalidQuery' &&
        String(err?.message).includes('concurrent update');
      if (isConcurrent && retries > 0) {
        const delay = (4 - retries) * 2000;
        await new Promise(r => setTimeout(r, delay));
        return this.save(record, retries - 1, expectedVersion);
      }
      return { success: false, error: String(error) };
    }
  }

  // ── 削除（論理削除） ───────────────────────────────────────────────

  async delete(fileId: string): Promise<BqResult<null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const now = new Date().toISOString();
      const getResult = await this.getBody(fileId);
      const row: VaultRecord = {
        file_id: fileId, file_type: 'md',
        category: '', title: null, content: getResult.success ? getResult.data : null,
        keywords: null, related_ids: null, size_bytes: null,
        is_deleted: true, created_at: now, updated_at: now,
        metadata: null,
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
               t.created_at, t.updated_at, t.metadata
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
