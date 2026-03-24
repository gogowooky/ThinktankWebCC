/**
 * bigqueryRoutes.ts
 * BigQuery API を使用したデータ操作 API ルート
 */

import { Router, Request, Response } from 'express';
import { bigqueryService, FileRecord } from '../services/BigQueryService.js';

const DEBOUNCE_MS = 60000; // 1 minute
const saveTimers = new Map<string, NodeJS.Timeout>();
const pendingSaves = new Map<string, FileRecord>();

// Serial queue to prevent concurrent DML on BigQuery (serialization error対策)
let saveQueue: Promise<void> = Promise.resolve();

function getFileKey(fileId: string, category: string | null): string {
    return `${fileId}_${category || ''}`;
}

async function executeSave(key: string) {
    const record = pendingSaves.get(key);
    if (!record) return;

    pendingSaves.delete(key);
    saveTimers.delete(key);

    // Chain onto the serial queue so BigQuery DML never runs concurrently
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
    
    // Update the pending record
    pendingSaves.set(key, record);

    // Reset the timer
    if (saveTimers.has(key)) {
        clearTimeout(saveTimers.get(key)!);
    }

    const timer = setTimeout(() => {
        executeSave(key);
    }, DEBOUNCE_MS);

    saveTimers.set(key, timer);
}

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
     * 
     * UPSERT キー: file_id + category
     * 同じ (file_id, category) のレコードが存在する場合は UPDATE、
     * 存在しない場合は INSERT される（BigQueryService.saveFile の MERGE文）。
     * created_at はクライアントから送られた値を優先し、
     * 送られない場合のみ現在時刻を使用する（UPDATE時はcreated_atは変更されない）。
     * 
     * 1分間のデバウンス処理が組み込まれています。
     */
    router.post('/files', async (req: Request, res: Response) => {
        try {
            const { file_id, title, file_type, category, content, metadata, created_at } = req.body;

            if (!file_id || !file_type) {
                return res.status(400).json({
                    error: 'file_id, file_type are required'
                });
            }

            const now = new Date();
            // created_at: クライアントが送ってきた値があればそれを使用（初回作成日時を保持）
            // 新規レコードの場合は now、既存レコードのUPDATE時はMERGE文がcreated_atを変更しない
            const createdAt = created_at ? new Date(created_at) : now;

            const record: FileRecord = {
                file_id,
                title: title || null,
                file_type,
                category: category || null,
                content: content || null,
                metadata: metadata || null,
                size_bytes: content ? Buffer.byteLength(content, 'utf8') : null,
                created_at: createdAt,
                updated_at: now
            };

            scheduleSave(record);

            res.json({ success: true, status: 'scheduled' });
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
     * 一括保存（UPSERT: file_id + category がキー）
     * 
     * UPSERT キー: file_id + category
     * 各レコードは BigQueryService.bulkSave → saveFile の MERGE文で処理される。
     * created_at: クライアントが送ってきた値を優先（初回作成日時を保持）。
     * 
     * 1分間のデバウンス処理が組み込まれています。
     */
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
                    // created_at: クライアントから送られた値があればそれを優先、なければ現在時刻
                    created_at: f.created_at ? new Date(f.created_at) : now,
                    updated_at: now
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
