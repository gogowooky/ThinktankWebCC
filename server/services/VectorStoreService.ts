/**
 * VectorStoreService.ts
 * Phase 15: BigQuery の tt_embeddings テーブルに embedding を保存し、
 * コサイン類似度でセマンティック検索を行う。
 */

import { BigQuery } from '@google-cloud/bigquery';

const DATASET_ID = 'thinktank';
const TABLE_ID   = 'tt_embeddings';

export interface VectorSearchResult {
  entry_id:   string;
  model_name: string;
  similarity: number;
}

export class VectorStoreService {
  private bigquery: BigQuery | null = null;
  private projectId: string | undefined;

  async initialize(bigquery: BigQuery, projectId: string): Promise<void> {
    this.bigquery  = bigquery;
    this.projectId = projectId;
    await this.ensureTableExists();
    console.log(`[VectorStoreService] Initialized (table: ${DATASET_ID}.${TABLE_ID})`);
  }

  private get tbl(): string {
    return `\`${this.projectId}.${DATASET_ID}.${TABLE_ID}\``;
  }

  private readonly EXPECTED_SCHEMA = [
    { name: 'entry_id',    type: 'STRING',    mode: 'REQUIRED' },
    { name: 'embedding',   type: 'FLOAT64',   mode: 'REPEATED' },
    { name: 'model_name',  type: 'STRING',    mode: 'NULLABLE' },
    { name: 'created_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
  ];

  private async ensureTableExists(): Promise<void> {
    if (!this.bigquery) return;
    const dataset = this.bigquery.dataset(DATASET_ID);
    const table   = dataset.table(TABLE_ID);
    const [exists] = await table.exists();

    if (exists) {
      const [meta] = await table.getMetadata() as unknown as [{ schema?: { fields?: Array<{ name: string; mode?: string }> } }];
      const fields = meta.schema?.fields ?? [];
      const expectedNames = new Set(this.EXPECTED_SCHEMA.map(f => f.name));
      // 期待外の REQUIRED フィールドがある場合は旧スキーマと判定して再作成
      const hasExtraRequired = fields.some(f => f.mode === 'REQUIRED' && !expectedNames.has(f.name));
      const hasEmbedding     = fields.some(f => f.name === 'embedding');
      if (hasEmbedding && !hasExtraRequired) return;

      console.warn(`[VectorStoreService] Incompatible schema detected. Dropping and recreating ${DATASET_ID}.${TABLE_ID}`);
      await table.delete();
    }

    await dataset.createTable(TABLE_ID, { schema: this.EXPECTED_SCHEMA });
    console.log(`[VectorStoreService] Created table ${DATASET_ID}.${TABLE_ID}`);
  }

  async upsert(entryId: string, vector: number[], modelName = 'gemini-embedding-001'): Promise<void> {
    if (!this.bigquery) throw new Error('[VectorStoreService] Not initialized');
    const row = {
      entry_id:   entryId,
      embedding:  vector,
      model_name: modelName,
      created_at: new Date(),
    };
    await this.insertRows([row]);
  }

  async upsertBatch(
    entries: Array<{ entryId: string; vector: number[] }>,
    modelName = 'gemini-embedding-001',
  ): Promise<void> {
    if (!this.bigquery || entries.length === 0) return;

    const rows = entries.map(e => ({
      entry_id:   e.entryId,
      embedding:  e.vector,
      model_name: modelName,
      created_at: new Date(),
    }));

    for (let i = 0; i < rows.length; i += 500) {
      await this.insertRows(rows.slice(i, i + 500));
    }
  }

  private async insertRows(rows: Array<Record<string, unknown>>): Promise<void> {
    if (!this.bigquery) return;
    // BigQuery v8: raw モードで insertId を明示指定しないと "Missing required field: id" になる
    const rawRows = rows.map((row, i) => ({
      insertId: `${String(row['entry_id'])}-${Date.now()}-${i}`,
      json: row,
    }));
    try {
      await this.bigquery.dataset(DATASET_ID).table(TABLE_ID).insert(rawRows, { raw: true });
    } catch (err: unknown) {
      const pfe = err as { name?: string; errors?: Array<{ errors?: Array<{ reason?: string; location?: string; message?: string }>; row?: Record<string, unknown> }> };
      if (pfe.name === 'PartialFailureError' && Array.isArray(pfe.errors)) {
        const details = pfe.errors.slice(0, 5).map(e => ({
          reason:   e.errors?.[0]?.reason,
          location: e.errors?.[0]?.location,
          message:  e.errors?.[0]?.message,
          entryId:  e.row?.['entry_id'],
        }));
        console.error('[VectorStoreService] PartialFailureError details:', JSON.stringify(details));
        throw new Error(`PartialFailureError: ${JSON.stringify(details)}`);
      }
      throw err;
    }
  }

  async delete(entryId: string): Promise<void> {
    if (!this.bigquery) return;
    await this.bigquery.query({
      query: `DELETE FROM ${this.tbl} WHERE entry_id = @entryId`,
      params: { entryId },
    });
  }

  /**
   * コサイン類似度でトップ k を返す。
   * BigQuery から全 embedding を取得し JS 側で計算（中小規模データ向け）。
   */
  async search(queryVector: number[], limit = 10): Promise<VectorSearchResult[]> {
    if (!this.bigquery) return [];

    const query = `SELECT entry_id, embedding, model_name FROM ${this.tbl}`;
    const [rows] = await this.bigquery.query({ query });

    type EmbRow = { entry_id: string; embedding: number[]; model_name: string };
    const results = (rows as EmbRow[]).map(row => ({
      entry_id:   row.entry_id,
      model_name: row.model_name,
      similarity: cosineSimilarity(queryVector, row.embedding),
    }));

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async count(): Promise<number> {
    if (!this.bigquery) return 0;
    const [rows] = await this.bigquery.query({ query: `SELECT COUNT(*) AS cnt FROM ${this.tbl}` });
    return Number((rows as Array<{ cnt: { value?: string } | number }>)[0]?.cnt ?? 0);
  }

  async listEntryIds(): Promise<string[]> {
    if (!this.bigquery) return [];
    const [rows] = await this.bigquery.query({ query: `SELECT entry_id FROM ${this.tbl}` });
    return (rows as Array<{ entry_id: string }>).map(r => r.entry_id);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const vectorStoreService = new VectorStoreService();
