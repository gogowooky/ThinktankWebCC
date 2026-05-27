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
    await this.dropTableIfExists();
    console.log(`[VectorStoreService] Initialized (table: ${DATASET_ID}.${TABLE_ID} cleanup checked)`);
  }

  private async dropTableIfExists(): Promise<void> {
    if (!this.bigquery) return;
    const dataset = this.bigquery.dataset(DATASET_ID);
    const table   = dataset.table(TABLE_ID);
    try {
      const [exists] = await table.exists();
      if (exists) {
        await table.delete();
        console.log(`[VectorStoreService] Successfully dropped table ${DATASET_ID}.${TABLE_ID} (セマンティック検索データ削除)`);
      } else {
        console.log(`[VectorStoreService] Table ${DATASET_ID}.${TABLE_ID} does not exist (すでに削除されています)`);
      }
    } catch (err) {
      console.error(`[VectorStoreService] Failed to drop table ${DATASET_ID}.${TABLE_ID}:`, err);
    }
  }

  // セマンティック検索機能廃止に伴い、ダミー化
  async upsert(_entryId: string, _vector: number[], _modelName = 'gemini-embedding-001'): Promise<void> {
    // 処理なし
  }

  async upsertBatch(
    _entries: Array<{ entryId: string; vector: number[] }>,
    _modelName = 'gemini-embedding-001',
  ): Promise<void> {
    // 処理なし
  }

  async delete(_entryId: string): Promise<void> {
    // 処理なし
  }

  async search(_queryVector: number[], _limit = 10): Promise<VectorSearchResult[]> {
    return [];
  }

  async count(): Promise<number> {
    return 0;
  }

  async listEntryIds(): Promise<string[]> {
    return [];
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
