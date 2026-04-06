/**
 * bigqueryRoutes.ts
 * BigQuery CRUD API routes
 *
 * Upsert key: (file_id, category) via MERGE statement.
 * Debounced writes (60s) with serial DML queue to avoid concurrent update errors.
 */

import { Router, Request, Response } from 'express';
import { bigqueryService, FileRecord } from '../services/BigQueryService.js';

const DEBOUNCE_MS = 60000;
const saveTimers = new Map<string, NodeJS.Timeout>();
const pendingSaves = new Map<string, FileRecord>();

let saveQueue: Promise<void> = Promise.resolve();

function getFileKey(fileId: string, category: string | null): string {
  return `${fileId}_${category || ''}`;
}

async function executeSave(key: string) {
  const record = pendingSaves.get(key);
  if (!record) return;

  pendingSaves.delete(key);
  saveTimers.delete(key);

  saveQueue = saveQueue.then(async () => {
    try {
      await bigqueryService.saveFile(record);
      console.log(`[BigQueryRoutes] Debounced save executed for ${key}`);
    } catch (error) {
      console.error(`[BigQueryRoutes] Debounced save failed for ${key}:`, error);
    }
  });
}

function scheduleSave(record: FileRecord) {
  const key = getFileKey(record.file_id, record.category);
  pendingSaves.set(key, record);

  if (saveTimers.has(key)) {
    clearTimeout(saveTimers.get(key)!);
  }

  const timer = setTimeout(() => { executeSave(key); }, DEBOUNCE_MS);
  saveTimers.set(key, timer);
}

export function createBigQueryRoutes(): Router {
  const router = Router();

  // GET /api/bq/files - List files
  router.get('/files', async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const sinceStr = req.query.since as string | undefined;
      let since: Date | undefined;

      if (sinceStr) {
        const parsed = new Date(sinceStr);
        if (!isNaN(parsed.getTime())) since = parsed;
      }

      const result = await bigqueryService.listFiles(category, since);
      if (!result.success) return res.status(500).json({ error: result.error });
      res.json({ files: result.data });
    } catch (error) {
      console.error('[BigQueryRoutes] List error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // GET /api/bq/files/:id - Get single file
  router.get('/files/:id', async (req: Request, res: Response) => {
    try {
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await bigqueryService.getFile(fileId);
      if (!result.success) return res.status(500).json({ error: result.error });
      if (!result.data || result.data.length === 0) return res.status(404).json({ error: 'File not found' });
      res.json({ file: result.data[0] });
    } catch (error) {
      console.error('[BigQueryRoutes] Get error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // POST /api/bq/files - Save file (upsert with 60s debounce)
  router.post('/files', async (req: Request, res: Response) => {
    try {
      const { file_id, title, file_type, category, content, metadata, created_at } = req.body;

      if (!file_id || !file_type) {
        return res.status(400).json({ error: 'file_id, file_type are required' });
      }

      const now = new Date();
      const record: FileRecord = {
        file_id,
        title: title || null,
        file_type,
        category: category || null,
        content: content || null,
        metadata: metadata || null,
        size_bytes: content ? Buffer.byteLength(content, 'utf8') : null,
        created_at: created_at ? new Date(created_at) : now,
        updated_at: now,
      };

      scheduleSave(record);
      res.json({ success: true, status: 'scheduled' });
    } catch (error) {
      console.error('[BigQueryRoutes] Save error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // DELETE /api/bq/files/:id - Delete file
  router.delete('/files/:id', async (req: Request, res: Response) => {
    try {
      const fileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await bigqueryService.deleteFile(fileId);
      if (!result.success) return res.status(500).json({ error: result.error });
      res.json({ success: true });
    } catch (error) {
      console.error('[BigQueryRoutes] Delete error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // GET /api/bq/ttsearch - Full-text search
  router.get('/ttsearch', async (req: Request, res: Response) => {
    try {
      const q = req.query.q as string;
      const category = req.query.category as string | undefined;

      if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

      const result = await bigqueryService.search(q, category);
      if (!result.success) return res.status(500).json({ error: result.error });
      res.json({ results: result.data });
    } catch (error) {
      console.error('[BigQueryRoutes] Search error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // GET /api/bq/versions - Version info for cache validation (optional ?category=)
  router.get('/versions', async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      const result = await bigqueryService.getVersions(category);
      if (!result.success) return res.status(500).json({ error: result.error });
      res.json({ versions: result.data });
    } catch (error) {
      console.error('[BigQueryRoutes] Versions error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // POST /api/bq/fetch-by-ids - Fetch full records by file_id list (for differential sync)
  router.post('/fetch-by-ids', async (req: Request, res: Response) => {
    try {
      const { fileIds, category } = req.body;
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ error: 'fileIds array is required' });
      }

      const result = await bigqueryService.getFilesByIds(fileIds, category);
      if (!result.success) return res.status(500).json({ error: result.error });

      const files = result.data || [];
      console.log(`[BigQueryRoutes] fetch-by-ids: ${files.length}/${fileIds.length} records`);
      res.json({ files, count: files.length });
    } catch (error) {
      console.error('[BigQueryRoutes] fetch-by-ids error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // GET /api/bq/all - Get all data (for cache rebuild)
  router.get('/all', async (req: Request, res: Response) => {
    try {
      const result = await bigqueryService.getAllFiles();
      if (!result.success) return res.status(500).json({ error: result.error });
      res.json({ files: result.data });
    } catch (error) {
      console.error('[BigQueryRoutes] All files error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // GET /api/bq/migrate - Get all records for a category with content (for sync/migration)
  router.get('/migrate', async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string;
      if (!category) return res.status(400).json({ error: 'category is required' });

      const result = await bigqueryService.listFilesFull(category);
      if (!result.success) return res.status(500).json({ error: result.error });

      const files = result.data || [];
      console.log(`[BigQueryRoutes] Migrate: ${files.length} records for category=${category}`);
      res.json({ files, count: files.length });
    } catch (error) {
      console.error('[BigQueryRoutes] Migrate error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // POST /api/bq/bulk - Bulk save (upsert with debounce)
  router.post('/bulk', async (req: Request, res: Response) => {
    try {
      const { files } = req.body;
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'files array is required' });
      }

      const now = new Date();
      for (const f of files) {
        const record: FileRecord = {
          file_id: f.file_id,
          title: f.title || null,
          file_type: f.file_type,
          category: f.category || null,
          content: f.content || null,
          metadata: f.metadata || null,
          size_bytes: f.content ? Buffer.byteLength(f.content, 'utf8') : null,
          created_at: f.created_at ? new Date(f.created_at) : now,
          updated_at: now,
        };
        scheduleSave(record);
      }

      res.json({ success: true, count: files.length, status: 'scheduled' });
    } catch (error) {
      console.error('[BigQueryRoutes] Bulk save error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
}
