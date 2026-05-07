/**
 * EmbeddingPipeline.ts
 * Phase 15: エントリー保存時・一括処理時の Embedding 生成パイプライン。
 */

import { embeddingService } from './EmbeddingService.js';
import { vectorStoreService } from './VectorStoreService.js';
import { bigqueryService } from './BigQueryService.js';

const BATCH_SIZE = 20; // 1回の処理単位

export interface PipelineProgress {
  total:        number;
  processed:    number;
  failed:       number;
  lastError?:   string;
}

export class EmbeddingPipeline {
  /** 単一エントリーの Embedding を生成して保存する */
  async processEntry(entryId: string, content: string): Promise<void> {
    const vector = await embeddingService.embed(content);
    await vectorStoreService.upsert(entryId, vector);
    console.log(`[EmbeddingPipeline] Embedded entry: ${entryId}`);
  }

  /**
   * BigQuery の全エントリーを一括 Embedding 処理する。
   * skipExisting=true のとき、既に Embedding 済みの entry_id をスキップする。
   * onProgress コールバックで進捗を通知する。
   */
  async processAll(
    onProgress?: (progress: PipelineProgress) => void,
    skipExisting = true,
  ): Promise<PipelineProgress> {
    const progress: PipelineProgress = { total: 0, processed: 0, failed: 0 };

    // BQ から全メタを取得
    const metaResult = await bigqueryService.listMeta();
    if (!metaResult.success) {
      console.error('[EmbeddingPipeline] Failed to fetch entries:', metaResult.error);
      return progress;
    }
    let entries = metaResult.data;

    // skipExisting: 既存 Embedding の entry_id を除外
    if (skipExisting) {
      const existingIds = new Set(await vectorStoreService.listEntryIds());
      entries = entries.filter(e => !existingIds.has(e.file_id));
    }

    progress.total = entries.length;
    onProgress?.(progress);

    if (entries.length === 0) return progress;

    // BATCH_SIZE ごとに処理
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);

      // content を取得しながら embedding テキストを組み立て
      const texts = await Promise.all(
        chunk.map(async e => {
          const contentRes = await bigqueryService.getContent(e.file_id);
          const body = contentRes.success ? (contentRes.data ?? '') : '';
          return `${e.title ?? ''}\n${body}`.trim();
        }),
      );

      try {
        const vectors = await embeddingService.embedBatch(texts);
        const batch = chunk.map((e, idx) => ({ entryId: e.file_id, vector: vectors[idx] }));
        await vectorStoreService.upsertBatch(batch);
        progress.processed += chunk.length;
      } catch (err) {
        const msg = String(err);
        console.error(`[EmbeddingPipeline] Batch failed at offset ${i}:`, msg);
        progress.failed += chunk.length;
        progress.lastError = msg;
        // 最初のバッチで連続失敗なら即中断（同じエラーが繰り返されるだけ）
        if (progress.processed === 0 && progress.failed >= BATCH_SIZE) {
          onProgress?.(progress);
          return progress;
        }
      }

      onProgress?.(progress);
    }

    return progress;
  }
}

export const embeddingPipeline = new EmbeddingPipeline();
