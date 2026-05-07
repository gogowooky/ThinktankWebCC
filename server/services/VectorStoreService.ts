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

  private async ensureTableExists(): Promise<void> {
    if (!this.bigquery) return;
    const dataset = this.bigquery.dataset(DATASET_ID);
    const table   = dataset.table(TABLE_ID);
    const [exists] = await table.exists();
    if (exists) return;

    await dataset.createTable(TABLE_ID, {
      schema: [
        { name: 'entry_id',    type: 'STRING',    mode: 'REQUIRED' },
        { name: 'embedding',   type: 'FLOAT64',   mode: 'REPEATED' },
        { name: 'model_name',  type: 'STRING',    mode: 'NULLABLE' },
        { name: 'created_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
      ],
    });
    console.log(`[VectorStoreService] Created table ${DATASET_ID}.${TABLE_ID}`);
  }

  async upsert(entryId: string, vector: number[], modelName = 'text-embedding-004'): Promise<void> {
    if (!this.bigquery) throw new Error('[VectorStoreService] Not initialized');

    // DELETE + INSERT で upsert（BigQuery は行レベルの MERGE が重いため）
    const deleteQuery = `DELETE FROM ${this.tbl} WHERE entry_id = @entryId`;
    await this.bigquery.query({ query: deleteQuery, params: { entryId } });

    const row = {
      entry_id:   entryId,
      embedding:  vector,
      model_name: modelName,
      created_at: new Date().toISOString(),
    };
    await this.bigquery.dataset(DATASET_ID).table(TABLE_ID).insert([row]);
  }

  async upsertBatch(
    entries: Array<{ entryId: string; vector: number[] }>,
    modelName = 'text-embedding-004',
  ): Promise<void> {
    if (!this.bigquery || entries.length === 0) return;

    const ids = entries.map(e => e.entryId);

    // 既存行を一括削除
    const inList = ids.map((_, i) => `@id${i}`).join(',');
    const params: Record<string, string> = {};
    ids.forEach((id, i) => { params[`id${i}`] = id; });
    await this.bigquery.query({
      query: `DELETE FROM ${this.tbl} WHERE entry_id IN (${inList})`,
      params,
    });

    const rows = entries.map(e => ({
      entry_id:   e.entryId,
      embedding:  e.vector,
      model_name: modelName,
      created_at: new Date().toISOString(),
    }));

    // BigQuery insert は 1 万行が上限なので 5000 件ずつに分割
    for (let i = 0; i < rows.length; i += 5000) {
      await this.bigquery.dataset(DATASET_ID).table(TABLE_ID).insert(rows.slice(i, i + 5000));
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
