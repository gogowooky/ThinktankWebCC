/**
 * BigQueryService.ts (v5)
 * thinktank.vault テーブルに対する CRUD サービス
 * vault_id フィールド廃止済み。MERGE 文 Upsert + 並列更新エラー自動リトライ
 */

import { BigQuery } from '@google-cloud/bigquery';
import yaml from 'js-yaml';
import { validateVaultKey } from './vaultKey.js';

const DATASET_ID = 'thinktank';
const TABLE_ID   = 'vault_ver2';

export interface VaultRecord {
  thinkid:     string;
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
  metadata?:   string | null;  // YAML 形式でシリアライズして保持する
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
  async saveThinkSupport(thinkId: string, expectedVersion: string, metadata: object, updatedAt: string): Promise<BqResult<boolean>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const { param: metadataParam, colType } = await this.encodeMetadata(metadata);
      const [rows] = await this.bigquery.query({
        query: `DECLARE changed INT64;
          BEGIN TRANSACTION;
          UPDATE ${this.tbl} SET metadata = ${colType === 'JSON' ? 'SAFE_CAST(@metadata AS JSON)' : '@metadata'}, updated_at = TIMESTAMP(@updatedAt)
          WHERE thinkid = @thinkId AND category = 'bundle' AND COALESCE(is_deleted, FALSE) = FALSE
            AND updated_at = TIMESTAMP(@expectedVersion)
            AND (SELECT COUNT(*) FROM ${this.tbl} WHERE thinkid = @thinkId) = 1;
          SET changed = @@row_count;
          COMMIT TRANSACTION;
          SELECT changed;`,
        params: { thinkId, expectedVersion, metadata: metadataParam, updatedAt },
        types: { thinkId: 'STRING', expectedVersion: 'STRING', metadata: colType, updatedAt: 'STRING' },
      });
      return { success: true, data: Number(rows[0]?.changed) === 1 };
    } catch (error) { return { success: false, error: String(error) }; }
  }

  /** Append structured AI conversation data to a Chat record with optimistic locking. */
  async saveChatConversation(thinkId: string, expectedVersion: string, metadata: object, content: string, updatedAt: string): Promise<BqResult<boolean>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const { param: metadataParam, colType } = await this.encodeMetadata(metadata);
      const [rows] = await this.bigquery.query({
        query: `DECLARE changed INT64;
          BEGIN TRANSACTION;
          UPDATE ${this.tbl} SET metadata = ${colType === 'JSON' ? 'SAFE_CAST(@metadata AS JSON)' : '@metadata'},
            content = @content, size_bytes = @size, updated_at = TIMESTAMP(@updatedAt)
          WHERE thinkid = @thinkId AND category = 'chat' AND COALESCE(is_deleted, FALSE) = FALSE
            AND updated_at = TIMESTAMP(@expectedVersion)
            AND (SELECT COUNT(*) FROM ${this.tbl} WHERE thinkid = @thinkId) = 1;
          SET changed = @@row_count;
          COMMIT TRANSACTION;
          SELECT changed;`,
        params: { thinkId, expectedVersion, metadata: metadataParam, content, size: Buffer.byteLength(content, 'utf8'), updatedAt },
        types: { thinkId: 'STRING', expectedVersion: 'STRING', metadata: colType, content: 'STRING', size: 'INT64', updatedAt: 'STRING' },
      });
      return { success: true, data: Number(rows[0]?.changed) === 1 };
    } catch (error) { return { success: false, error: String(error) }; }
  }

  private get tbl(): string {
    return `\`${this.projectId}.${DATASET_ID}.${TABLE_ID}\``;
  }

  /**
   * metadata 列の実体型（STRING か BigQuery ネイティブ JSON か）をテーブル定義から確認する。
   * 列が JSON 型の場合、YAML テキストをそのまま SAFE_CAST(@metadata AS JSON) に渡すと
   * 構文エラーで NULL になる（YAML は JSON のスーパーセットではない）ため、
   * JSON 文字列スカラーとして包んでから渡す必要がある。
   */
  private async metadataColumnType(): Promise<'STRING' | 'JSON'> {
    if (!this.bigquery || typeof this.bigquery.dataset !== 'function') return 'STRING';
    try {
      const [table] = await this.bigquery.dataset(DATASET_ID).table(TABLE_ID).getMetadata();
      const type = table.schema?.fields?.find((f: { name?: string }) => f.name === 'metadata')?.type;
      return type === 'JSON' ? 'JSON' : 'STRING';
    } catch {
      return 'STRING';
    }
  }

  /** metadata オブジェクトを YAML化し、列の実体型に応じたクエリパラメータ文字列に変換する。 */
  private async encodeMetadata(metadata: object): Promise<{ param: string; colType: 'STRING' | 'JSON' }> {
    const colType = await this.metadataColumnType();
    const text = yaml.dump(metadata);
    return { param: colType === 'JSON' ? JSON.stringify(text) : text, colType };
  }

  /** Insertion and the applied marker commit together, so retries cannot create orphan artifacts. */
  async applyAgentArtifact(bundleId: string, expectedVersion: string, metadata: object, updatedAt: string,
    artifact: { thinkId: string; title: string; body: string; metadata: object }): Promise<BqResult<boolean>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    if (!validateVaultKey(bundleId, 'bundle').ok || !validateVaultKey(artifact.thinkId, 'memo').ok || bundleId === artifact.thinkId) return { success: false, error: 'invalid artifact id' };
    try {
      const { param: metadataParam, colType } = await this.encodeMetadata(metadata);
      const artifactMetadataParam = colType === 'JSON' ? JSON.stringify(yaml.dump(artifact.metadata)) : yaml.dump(artifact.metadata);
      const metadataExpr = colType === 'JSON' ? 'SAFE_CAST(@metadata AS JSON)' : '@metadata';
      const artifactMetadataExpr = colType === 'JSON' ? 'SAFE_CAST(@artifactMetadata AS JSON)' : '@artifactMetadata';
      const [rows] = await this.bigquery.query({
        query: `DECLARE changed INT64;
          BEGIN TRANSACTION;
          UPDATE ${this.tbl} SET metadata = ${metadataExpr}, updated_at = TIMESTAMP(@updatedAt)
          WHERE thinkid = @bundleId AND category = 'bundle' AND COALESCE(is_deleted, FALSE) = FALSE
            AND updated_at = TIMESTAMP(@expectedVersion)
            AND (SELECT COUNT(*) FROM ${this.tbl} WHERE thinkid = @bundleId) = 1
            AND NOT EXISTS (SELECT 1 FROM ${this.tbl} WHERE thinkid = @artifactId);
          SET changed = @@row_count;
          IF changed = 1 THEN
            INSERT INTO ${this.tbl} (thinkid, file_type, category, title, content, keywords, related_ids, size_bytes, is_deleted, created_at, updated_at, metadata)
            VALUES (@artifactId, 'md', 'memo', @title, @body, '', '', @size, FALSE, TIMESTAMP(@updatedAt), TIMESTAMP(@updatedAt), ${artifactMetadataExpr});
          END IF;
          COMMIT TRANSACTION;
          SELECT changed;`,
        params: { bundleId, expectedVersion, metadata: metadataParam, updatedAt, artifactId: artifact.thinkId,
          title: `# ${artifact.title}`, body: artifact.body, size: Buffer.byteLength(`# ${artifact.title}\n${artifact.body}`), artifactMetadata: artifactMetadataParam },
        types: { bundleId: 'STRING', expectedVersion: 'STRING', metadata: colType, updatedAt: 'STRING', artifactId: 'STRING', title: 'STRING', body: 'STRING', size: 'INT64', artifactMetadata: colType },
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
        // file_id → thinkid への改称は列削除を伴わない安全な操作だが、本番テーブルへの
        // DDL 自動実行はここでは行わない。運用者が一度だけ手動で実行すること：
        //   ALTER TABLE `<project>.thinktank.vault_ver2` RENAME COLUMN file_id TO thinkid;
        const hasThinkid = fields.some((f: any) => f.name === 'thinkid');
        if (!hasThinkid && fields.some((f: any) => f.name === 'file_id')) {
          console.warn(`[BigQueryService] Table still has 'file_id' — run the manual RENAME COLUMN migration (see docs) before relying on 'thinkid'.`);
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
        { name: 'thinkid',     type: 'STRING',    mode: 'REQUIRED' },
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
        SELECT t.thinkid, t.file_type, t.category, t.title,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at, t.metadata
        FROM ${this.tbl} t
        INNER JOIN (
          SELECT thinkid, MAX(updated_at) AS max_upd
          FROM ${this.tbl}
          WHERE COALESCE(is_deleted, FALSE) = FALSE
          GROUP BY thinkid
        ) latest ON t.thinkid = latest.thinkid AND t.updated_at = latest.max_upd
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
        SELECT t.thinkid, t.file_type, t.category, t.title, t.content,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at, t.metadata
        FROM ${this.tbl} t
        INNER JOIN (
          SELECT thinkid, MAX(updated_at) AS max_upd
          FROM ${this.tbl}
          WHERE COALESCE(is_deleted, FALSE) = FALSE
          GROUP BY thinkid
        ) latest ON t.thinkid = latest.thinkid AND t.updated_at = latest.max_upd
        WHERE COALESCE(t.is_deleted, FALSE) = FALSE
      `;
      const [rows] = await this.bigquery.query({ query });
      return { success: true, data: rows as VaultRecord[] };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 単一レコード取得（title/category/content を含む完全形） ──────────────

  async getRecord(thinkId: string): Promise<BqResult<VaultRecord | null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT t.thinkid, t.file_type, t.category, t.title, t.content,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at, t.metadata
        FROM ${this.tbl} t
        WHERE t.thinkid = @thinkId
          AND COALESCE(t.is_deleted, FALSE) = FALSE
        ORDER BY t.updated_at DESC LIMIT 1
      `;
      const [rows] = await this.bigquery.query({ query, params: { thinkId } });
      return { success: true, data: (rows as VaultRecord[])[0] ?? null };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ── 本文のみ取得（タイトル行は title 列にあるので含まれない）──────────

  async getBody(thinkId: string): Promise<BqResult<string | null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const query = `
        SELECT content FROM ${this.tbl}
        WHERE thinkid = @thinkId
        ORDER BY updated_at DESC LIMIT 1
      `;
      const [rows] = await this.bigquery.query({ query, params: { thinkId } });
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
    // 両方がここを通るため、不正な thinkid / category はこの最下層で弾く。
    const keyCheck = validateVaultKey(record.thinkid, record.category, {
      isDeleted: record.is_deleted === true,
    });
    if (!keyCheck.ok) return { success: false, error: keyCheck.error };

    try {
      // metadata が null でも列が JSON 型なら JSON として渡す。STRING 型の NULL は
      // JSON 列へ代入できず MERGE 全体が失敗する（metadata なしの新規作成が保存できなくなる）。
      const colType = await this.metadataColumnType();
      const metadataParam = record.metadata == null
        ? null
        : (colType === 'JSON' ? JSON.stringify(record.metadata) : record.metadata);
      const metadataExpr = colType === 'JSON' ? 'SAFE_CAST(@metadata AS JSON)' : '@metadata';
      const query = `${expectedVersion ? 'DECLARE changed INT64; BEGIN TRANSACTION;' : ''}
        MERGE ${this.tbl} AS target
        USING (
          SELECT @thinkid AS thinkid, @file_type AS file_type,
                 @category AS category,
                 @title AS title, @content AS content,
                 @keywords AS keywords, @related_ids AS related_ids,
                 @size_bytes AS size_bytes,
                 @is_deleted AS is_deleted,
                 @created_at AS created_at, @updated_at AS updated_at,
                 ${metadataExpr} AS metadata
        ) AS source ON target.thinkid = source.thinkid
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
          (thinkid, file_type, category, title, content,
           keywords, related_ids, size_bytes, is_deleted, created_at, updated_at, metadata)
        VALUES
          (source.thinkid, source.file_type, source.category,
           source.title, source.content, source.keywords, source.related_ids,
           source.size_bytes, source.is_deleted, source.created_at, source.updated_at, source.metadata)
        ${expectedVersion ? ' ; SET changed = @@row_count; ASSERT changed <= 1 AS "duplicate thinkid"; COMMIT TRANSACTION; SELECT changed;' : ''}
      `;
      const params = {
        thinkid:     record.thinkid,
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
        metadata:    metadataParam,
        ...(expectedVersion ? { expectedVersion } : {}),
      };
      const types = {
        thinkid: 'STRING', file_type: 'STRING', category: 'STRING',
        title: 'STRING', content: 'STRING', keywords: 'STRING', related_ids: 'STRING',
        size_bytes: 'INT64', is_deleted: 'BOOL',
        created_at: 'TIMESTAMP', updated_at: 'TIMESTAMP',
        metadata: colType,
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

  async delete(thinkId: string): Promise<BqResult<null>> {
    if (!this.bigquery) return { success: false, error: 'not initialized' };
    try {
      const now = new Date().toISOString();
      const getResult = await this.getBody(thinkId);
      const row: VaultRecord = {
        thinkid: thinkId, file_type: 'md',
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
        SELECT t.thinkid, t.file_type, t.category, t.title,
               t.keywords, t.related_ids, t.size_bytes,
               COALESCE(t.is_deleted, FALSE) AS is_deleted,
               t.created_at, t.updated_at, t.metadata
        FROM ${this.tbl} t
        INNER JOIN (
          SELECT thinkid, MAX(updated_at) AS max_upd
          FROM ${this.tbl}
          WHERE COALESCE(is_deleted, FALSE) = FALSE
          GROUP BY thinkid
        ) latest ON t.thinkid = latest.thinkid AND t.updated_at = latest.max_upd
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
