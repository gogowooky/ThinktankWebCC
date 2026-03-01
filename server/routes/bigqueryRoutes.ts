/**
 * bigqueryRoutes.ts
 * BigQuery API を使用したデータ操作 API ルート
 */

import { Router, Request, Response } from 'express';
import { bigqueryService, FileRecord } from '../services/BigQueryService.js';

export function createBigQueryRoutes(): Router {
    const router = Router();

    /**
     * GET /api/bq/files
     * ファイル一覧を取得
     * query: category (optional), since (optional ISO date string)
     */
    router.get('/files', async (req: Request, res: Response) => {
        try {
            const category = req.query.category as string | undefined;
            const sinceStr = req.query.since as string | undefined;
            let since: Date | undefined;

            if (sinceStr) {
                const parsed = new Date(sinceStr);
                if (!isNaN(parsed.getTime())) {
                    since = parsed;
                }
            }

            const result = await bigqueryService.listFiles(category, since);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ files: result.data });
        } catch (error) {
            console.error('[BigQueryRoutes] List error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * GET /api/bq/files/:id
     * 単一ファイルを取得
     */
    router.get('/files/:id', async (req: Request, res: Response) => {
        try {
            const fileId = req.params.id;
            const result = await bigqueryService.getFile(fileId);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            if (!result.data || result.data.length === 0) {
                return res.status(404).json({ error: 'File not found' });
            }

            res.json({ file: result.data[0] });
        } catch (error) {
            console.error('[BigQueryRoutes] Get error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * POST /api/bq/files
     * ファイルを保存（新規作成または更新）
     */
    router.post('/files', async (req: Request, res: Response) => {
        try {
            const { file_id, title, file_type, category, content, metadata } = req.body;

            if (!file_id || !file_type) {
                return res.status(400).json({
                    error: 'file_id, file_type are required'
                });
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
                created_at: now,
                updated_at: now
            };

            const result = await bigqueryService.saveFile(record);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('[BigQueryRoutes] Save error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * DELETE /api/bq/files/:id
     * ファイルを削除
     */
    router.delete('/files/:id', async (req: Request, res: Response) => {
        try {
            const fileId = req.params.id;
            const result = await bigqueryService.deleteFile(fileId);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('[BigQueryRoutes] Delete error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * GET /api/bq/ttsearch
     * 全文検索
     */
    router.get('/ttsearch', async (req: Request, res: Response) => {
        try {
            const q = req.query.q as string;
            const category = req.query.category as string | undefined;

            if (!q) {
                return res.status(400).json({ error: 'Query parameter "q" is required' });
            }

            const result = await bigqueryService.search(q, category);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ results: result.data });
        } catch (error) {
            console.error('[BigQueryRoutes] Search error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * GET /api/bq/versions
     * バージョン情報を取得（キャッシュ整合性チェック用）
     */
    router.get('/versions', async (req: Request, res: Response) => {
        try {
            const result = await bigqueryService.getVersions();

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ versions: result.data });
        } catch (error) {
            console.error('[BigQueryRoutes] Versions error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * GET /api/bq/all
     * 全データ取得（キャッシュ再構築用）
     */
    router.get('/all', async (req: Request, res: Response) => {
        try {
            const result = await bigqueryService.getAllFiles();

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ files: result.data });
        } catch (error) {
            console.error('[BigQueryRoutes] All files error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * POST /api/bq/bulk
     * 一括保存
     */
    router.post('/bulk', async (req: Request, res: Response) => {
        try {
            const { files } = req.body;

            if (!Array.isArray(files) || files.length === 0) {
                return res.status(400).json({ error: 'files array is required' });
            }

            const now = new Date();
            const records: FileRecord[] = files.map(f => ({
                file_id: f.file_id,
                title: f.title || null,
                file_type: f.file_type,
                category: f.category || null,
                content: f.content || null,
                metadata: f.metadata || null,
                size_bytes: f.content ? Buffer.byteLength(f.content, 'utf8') : null,
                created_at: now,
                updated_at: now
            }));

            const result = await bigqueryService.bulkSave(records);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ success: true, count: records.length });
        } catch (error) {
            console.error('[BigQueryRoutes] Bulk save error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    return router;
}
