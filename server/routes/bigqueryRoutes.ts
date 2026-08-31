/**
 * bigqueryRoutes.ts (v5)
 * thinktank.vault に対する CRUD API ルート
 * vault_id フィールド廃止済み
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { bigqueryService } from '../services/BigQueryService.js';
import type { VaultRecord } from '../services/BigQueryService.js';
import { isValidCategory, SAFE_FILE_ID_RE } from '../services/vaultKey.js';
import { isServerNewer } from '../services/vaultVersion.js';
import fs from 'fs';
import path from 'path';

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
    metadata:    r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : undefined,
  };
}

interface ExportStatus {
  running: boolean;
  total: number;
  current: number;
  path: string;
}

let exportStatus: ExportStatus = {
  running: false,
  total: 0,
  current: 0,
  path: ''
};

// id / contentType はそのままファイルパス（category ディレクトリ名 + ファイル名）に
// 使われるため、パストラバーサル（"../" 等）を防ぐために厳格な文字種のみ許可する。
// 実体は server/services/vaultKey.ts（BigQueryService と共有）。
const SAFE_ID_RE = SAFE_FILE_ID_RE;

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
    const { id, contentType, title, content, keywords, relatedIds, metadata, baseUpdatedAt } = req.body as {
      id: string; contentType: string;
      title: string; content: string;
      keywords?: string; relatedIds?: string;
      metadata?: any;
      baseUpdatedAt?: string;
    };
    if (!id || !contentType) {
      res.status(400).json({ error: 'id, contentType are required' }); return;
    }
    if (!SAFE_ID_RE.test(id)) {
      res.status(400).json({ error: 'id contains invalid characters' }); return;
    }
    if (!isValidCategory(contentType)) {
      res.status(400).json({ error: `unsupported contentType: ${contentType}` }); return;
    }
    let fileDate = new Date();
    // 日付 ID（サフィックス -memo, -a3f9 等を含む場合も先頭の日時部分を採用）
    const dateMatch = id.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\w+)?$/);
    if (dateMatch) {
      const [_, yyyy, MM, dd, HH, mm, ss] = dateMatch;
      fileDate = new Date(`${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}+09:00`);
    }
    const fileTimeStr = fileDate.toISOString();
    const nowStr = new Date().toISOString();

    // 楽観ロック（PROJECT_REVIEW_REPORT.md D-2）: baseUpdatedAt が渡され、かつサーバー側の
    // 現在レコードがそれより新しければ、無警告上書きせず 409 を返す。
    if (baseUpdatedAt) {
      const existing = await bigqueryService.getRecord(id);
      if (existing.success && existing.data && isServerNewer(baseUpdatedAt, existing.data.updated_at)) {
        const serverUpdatedAt = typeof existing.data.updated_at === 'object' && existing.data.updated_at !== null
          ? (existing.data.updated_at as { value: string }).value
          : String(existing.data.updated_at);
        res.status(409).json({ error: 'conflict', serverUpdatedAt });
        return;
      }
    }

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
      created_at:  fileTimeStr,
      updated_at:  nowStr,
      metadata:    metadata ? JSON.stringify(metadata) : null,
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

  // POST /api/bq/files/export  ← ローカル側へのエクスポート実行
  router.post('/files/export', async (_req: Request, res: Response) => {
    if (exportStatus.running) {
      res.status(409).json({ error: 'Export is already running' });
      return;
    }
    try {
      const result = await bigqueryService.listAllWithContent();
      if (!result.success) { res.status(500).json({ error: result.error }); return; }

      const records = result.data;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const yyyyMMdd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      
      // 保存先フォルダのパス: {root}/../Thinktank_{yyyyMMdd}/
      const exportDir = path.resolve(process.cwd(), '../', `Thinktank_${yyyyMMdd}`);
      const metaDir = path.join(exportDir, 'meta');

      // 保存先ディレクトリを作成
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir, { recursive: true });
      }

      exportStatus = {
        running: true,
        total: records.length,
        current: 0,
        path: exportDir
      };

      const exportDirResolved = path.resolve(exportDir) + path.sep;

      for (const r of records) {
        const fullContent = r.content ? `${r.title}\n${r.content}` : (r.title || '');
        const fileId = r.file_id;
        const category = r.category || 'unknown';

        // 既存レコードに旧バージョン由来の不正な id/category が混入している
        // 可能性を考慮し、書き込み先が exportDir 配下から外れないことを検証する。
        if (!SAFE_ID_RE.test(fileId) || !SAFE_ID_RE.test(category)) {
          console.warn(`[bigqueryRoutes] export: skip unsafe id/category (${fileId} / ${category})`);
          exportStatus.current++;
          continue;
        }

        let targetPath = '';
        if (category === 'memo') {
          targetPath = path.join(exportDir, `${fileId}.md`);
        } else {
          const categoryDir = path.join(exportDir, category);
          if (!fs.existsSync(categoryDir)) {
            fs.mkdirSync(categoryDir, { recursive: true });
          }
          targetPath = path.join(categoryDir, `${fileId}.md`);
        }
        const metaPath = path.join(metaDir, `${fileId}.json`);

        if (!path.resolve(targetPath).startsWith(exportDirResolved) ||
            !path.resolve(metaPath).startsWith(exportDirResolved)) {
          console.warn(`[bigqueryRoutes] export: blocked path traversal attempt (${fileId})`);
          exportStatus.current++;
          continue;
        }

        await fs.promises.writeFile(targetPath, fullContent, 'utf8');

        // メタデータの個別エクスポート
        const metaObj = r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : {};
        await fs.promises.writeFile(metaPath, JSON.stringify(metaObj, null, 2), 'utf8');

        exportStatus.current++;
      }

      exportStatus.running = false;
      res.json({ success: true, count: records.length, path: exportDir });
    } catch (err: any) {
      exportStatus.running = false;
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/bq/files/export/status  ← エクスポート進捗の取得
  router.get('/files/export/status', (_req: Request, res: Response) => {
    res.json(exportStatus);
  });

  return router;
}
