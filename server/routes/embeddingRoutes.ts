/**
 * embeddingRoutes.ts
 * Phase 15: Embedding 生成・セマンティック検索 API
 *
 * POST /api/embeddings/generate   — 単一エントリーの Embedding 生成
 * POST /api/embeddings/batch      — 全エントリーの一括 Embedding 生成（SSE）
 * GET  /api/embeddings/search     — セマンティック検索
 * GET  /api/embeddings/status     — 登録済み件数
 */

import { Router } from 'express';
import { embeddingService } from '../services/EmbeddingService.js';
import { vectorStoreService } from '../services/VectorStoreService.js';
import { embeddingPipeline } from '../services/EmbeddingPipeline.js';
import { bigqueryService } from '../services/BigQueryService.js';

export function createEmbeddingRoutes(): Router {
  const router = Router();

  // ── GET /status ──────────────────────────────────────────────────────
  router.get('/status', async (_req, res) => {
    try {
      const count = await vectorStoreService.count();
      res.json({ count, model: embeddingService.modelName, dimensions: embeddingService.dimensions });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── POST /generate ───────────────────────────────────────────────────
  router.post('/generate', async (req, res) => {
    const { entryId, content } = req.body as { entryId?: string; content?: string };
    if (!entryId || !content) {
      res.status(400).json({ error: 'entryId and content are required' });
      return;
    }
    try {
      await embeddingPipeline.processEntry(entryId, content);
      res.json({ success: true, entryId });
    } catch (e) {
      console.error('[embeddingRoutes] generate failed:', e);
      res.status(500).json({ error: String(e) });
    }
  });

  // ── POST /batch ── SSE で進捗を送信 ──────────────────────────────────
  router.post('/batch', async (req, res) => {
    const skipExisting = req.body?.skipExisting !== false;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const write = (data: object) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const progress = await embeddingPipeline.processAll(
        (p) => write({ type: 'progress', ...p }),
        skipExisting,
      );
      write({ type: 'done', ...progress });
    } catch (e) {
      write({ type: 'error', message: String(e) });
    } finally {
      res.end();
    }
  });

  // ── GET /search ──────────────────────────────────────────────────────
  router.get('/search', async (req, res) => {
    const q      = (req.query['q'] as string | undefined)?.trim();
    const limit  = Math.min(parseInt(req.query['limit'] as string || '10'), 50);
    const hybrid = req.query['hybrid'] === 'true';

    if (!q) {
      res.status(400).json({ error: 'q is required' });
      return;
    }

    try {
      // クエリをベクトル化
      const queryVector = await embeddingService.embed(q);

      // セマンティック検索
      const semanticResults = await vectorStoreService.search(queryVector, limit);

      // メタデータを付与
      const metaResult = await bigqueryService.listMeta();
      const metaMap = new Map(
        metaResult.success
          ? metaResult.data.map(m => [m.file_id, m])
          : [],
      );

      const enriched = semanticResults
        .map(r => {
          const meta = metaMap.get(r.entry_id);
          return {
            id:          r.entry_id,
            similarity:  Math.round(r.similarity * 1000) / 1000,
            title:       meta?.title   ?? r.entry_id,
            contentType: meta?.category ?? 'memo',
            keywords:    meta?.keywords   ?? '',
            relatedIds:  meta?.related_ids ?? '',
            updatedAt:   meta?.updated_at  ?? '',
          };
        })
        .filter(r => r.similarity > 0.1); // ノイズカット

      // hybrid モード: キーワード検索結果とマージ（類似度優先）
      if (hybrid) {
        const kwResult = await bigqueryService.search(q);
        if (kwResult.success) {
          const semanticIds = new Set(enriched.map(r => r.id));
          const kwOnly = kwResult.data
            .filter(r => !semanticIds.has(r.file_id))
            .map(r => ({
              id:          r.file_id,
              similarity:  0,
              title:       r.title   ?? r.file_id,
              contentType: r.category ?? 'memo',
              keywords:    r.keywords   ?? '',
              relatedIds:  r.related_ids ?? '',
              updatedAt:   r.updated_at  ?? '',
              isKeywordOnly: true,
            }));
          const merged = [...enriched, ...kwOnly].slice(0, limit);
          res.json({ results: merged, mode: 'hybrid' });
          return;
        }
      }

      res.json({ results: enriched, mode: 'semantic' });
    } catch (e) {
      console.error('[embeddingRoutes] search failed:', e);
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
