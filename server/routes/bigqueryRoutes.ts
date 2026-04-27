/**
 * bigqueryRoutes.ts (v5)
 * thinktank.vault に対する CRUD API ルート
 * vault_id フィールド廃止済み
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { bigqueryService } from '../services/BigQueryService.js';
import type { VaultRecord } from '../services/BigQueryService.js';

function toMeta(r: VaultRecord) {
  return {
    id:          r.file_id,
    contentType: r.category,
    title:       r.title ?? '',
    keywords:    r.keywords ?? '',
    relatedIds:  r.related_ids ?? '',
    sizeBytes:   r.size_bytes ?? 0,
    isDeleted:   r.is_deleted ?? false,
    createdAt:   r.created_at == null ? '' :
                   typeof r.created_at === 'object'
                     ? (r.created_at as unknown as { value: string }).value
                     : String(r.created_at),
    updatedAt:   r.updated_at == null ? '' :
                   typeof r.updated_at === 'object'
                     ? (r.updated_at as unknown as { value: string }).value
                     : String(r.updated_at),
  };
}

export function createBigQueryRoutes() {
  const router = Router();

  // GET /api/bq/files/meta  ← メタデータのみ（content なし）
  router.get('/files/meta', async (_req: Request, res: Response) => {
    const result = await bigqueryService.listMeta();
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json(result.data.map(toMeta));
  });

  // GET /api/bq/files/search?q=  ← 全文検索
  router.get('/files/search', async (req: Request, res: Response) => {
    const q = (req.query['q'] as string) ?? '';
    const result = await bigqueryService.search(q);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json(result.data.map(toMeta));
  });

  // GET /api/bq/files/:id/content  ← 本文のみ取得
  router.get('/files/:id/content', async (req: Request, res: Response) => {
    const fileId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const result = await bigqueryService.getContent(fileId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    if (result.data === null) { res.status(404).json({ error: 'not found' }); return; }
    res.json(result.data);
  });

  // GET /api/bq/files  ← フルレコード一覧（meta のみで代用）
  router.get('/files', async (_req: Request, res: Response) => {
    const result = await bigqueryService.listMeta();
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json(result.data.map(toMeta));
  });

  // POST /api/bq/files  ← 保存（Upsert）
  router.post('/files', async (req: Request, res: Response) => {
    const { id, contentType, title, content, keywords, relatedIds } = req.body as {
      id: string; contentType: string;
      title: string; content: string;
      keywords?: string; relatedIds?: string;
    };
    if (!id || !contentType) {
      res.status(400).json({ error: 'id, contentType are required' }); return;
    }
    const now = new Date().toISOString();
    const record: VaultRecord = {
      file_id:     id,
      file_type:   'md',
      category:    contentType,
      title:       title ?? null,
      content:     content ?? null,
      keywords:    keywords ?? null,
      related_ids: relatedIds ?? null,
      size_bytes:  content ? Buffer.byteLength(content, 'utf8') : null,
      is_deleted:  false,
      created_at:  now,
      updated_at:  now,
    };
    const result = await bigqueryService.save(record);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json(toMeta(record));
  });

  // DELETE /api/bq/files/:id  ← 削除（論理削除）
  router.delete('/files/:id', async (req: Request, res: Response) => {
    const fileId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    const result = await bigqueryService.delete(fileId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json({ success: true });
  });

  return router;
}
