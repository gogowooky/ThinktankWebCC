/**
 * bigqueryRoutes.ts (v5)
 * thinktank.vault に対する CRUD API ルート
 * LocalFS API（C# port 8081）と同じ URL パターンに揃えることで
 * BigQueryStorageBackend と LocalStorageBackend のインターフェースを統一する
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { bigqueryService } from '../services/BigQueryService.js';
import type { VaultRecord } from '../services/BigQueryService.js';

function toMeta(r: VaultRecord) {
  return {
    id:          r.file_id,
    vaultId:     r.vault_id,
    contentType: r.category,
    title:       r.title ?? '',
    keywords:    r.keywords ?? '',
    relatedIds:  r.related_ids ?? '',
    sizeBytes:   r.size_bytes ?? 0,
    isDeleted:   r.is_deleted ?? false,
    createdAt:   typeof r.created_at === 'object'
                   ? (r.created_at as unknown as { value: string }).value
                   : String(r.created_at),
    updatedAt:   typeof r.updated_at === 'object'
                   ? (r.updated_at as unknown as { value: string }).value
                   : String(r.updated_at),
  };
}

export function createBigQueryRoutes() {
  const router = Router();

  // GET /api/bq/files/meta?vaultId=  ← メタデータのみ（content なし）
  router.get('/files/meta', async (req: Request, res: Response) => {
    const vaultId = req.query['vaultId'] as string;
    if (!vaultId) { res.status(400).json({ error: 'vaultId required' }); return; }
    const result = await bigqueryService.listMeta(vaultId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json(result.data.map(toMeta));
  });

  // GET /api/bq/files/search?vaultId=&q=  ← 全文検索
  router.get('/files/search', async (req: Request, res: Response) => {
    const vaultId = req.query['vaultId'] as string;
    const q       = (req.query['q'] as string) ?? '';
    if (!vaultId) { res.status(400).json({ error: 'vaultId required' }); return; }
    const result = await bigqueryService.search(vaultId, q);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json(result.data.map(toMeta));
  });

  // GET /api/bq/files/:id/content?vaultId=  ← 本文のみ取得
  router.get('/files/:id/content', async (req: Request, res: Response) => {
    const vaultId = req.query['vaultId'] as string;
    const fileId  = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    if (!vaultId) { res.status(400).json({ error: 'vaultId required' }); return; }
    const result = await bigqueryService.getContent(vaultId, fileId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    if (result.data === null) { res.status(404).json({ error: 'not found' }); return; }
    res.json(result.data);
  });

  // GET /api/bq/files?vaultId=  ← フルレコード一覧（meta のみで代用）
  router.get('/files', async (req: Request, res: Response) => {
    const vaultId = req.query['vaultId'] as string;
    if (!vaultId) { res.status(400).json({ error: 'vaultId required' }); return; }
    const result = await bigqueryService.listMeta(vaultId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json(result.data.map(toMeta));
  });

  // POST /api/bq/files  ← 保存（Upsert）
  router.post('/files', async (req: Request, res: Response) => {
    const { id, vaultId, contentType, title, content, keywords, relatedIds } = req.body as {
      id: string; vaultId: string; contentType: string;
      title: string; content: string;
      keywords?: string; relatedIds?: string;
    };
    if (!id || !vaultId || !contentType) {
      res.status(400).json({ error: 'id, vaultId, contentType are required' }); return;
    }
    const now = new Date().toISOString();
    const record: VaultRecord = {
      file_id:     id,
      vault_id:    vaultId,
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

  // DELETE /api/bq/files/:id?vaultId=  ← 削除（論理削除）
  router.delete('/files/:id', async (req: Request, res: Response) => {
    const vaultId = req.query['vaultId'] as string;
    const fileId  = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];
    if (!vaultId) { res.status(400).json({ error: 'vaultId required' }); return; }
    const result = await bigqueryService.delete(vaultId, fileId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json({ success: true });
  });

  return router;
}
