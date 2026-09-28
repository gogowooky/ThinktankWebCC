/**
 * bigqueryRoutes.ts (v5)
 * thinktank.vault に対する CRUD API ルート
 * vault_id フィールド廃止済み
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import yaml from 'js-yaml';
import { bigqueryService } from '../services/BigQueryService.js';
import type { VaultRecord } from '../services/BigQueryService.js';
import { isValidCategory, SAFE_FILE_ID_RE } from '../services/vaultKey.js';
import { isServerNewer } from '../services/vaultVersion.js';
import { readThinkSupport, validThinkInput } from '../services/thinkSupportRecord.js';
import fs from 'fs';
import path from 'path';

function toMeta(r: VaultRecord) {
  return {
    thinkid:     r.thinkid,
    category:    r.category,
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
    metadata:    r.metadata ? (typeof r.metadata === 'string' ? yaml.load(r.metadata) : r.metadata) : undefined,
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

  router.get('/files/:id/think-support', async (req: Request, res: Response) => {
    const thinkId = String(req.params.id);
    if (!SAFE_ID_RE.test(thinkId)) { res.status(400).json({ error: 'invalid id' }); return; }
    const result = await bigqueryService.getRecord(thinkId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    if (!result.data || result.data.category !== 'bundle') { res.status(404).json({ error: 'bundle not found' }); return; }
    try { res.json(toMeta(result.data)); }
    catch { res.status(422).json({ error: 'invalid stored metadata' }); }
  });

  router.put('/files/:id/think-support', async (req: Request, res: Response) => {
    const thinkId = String(req.params.id);
    const { values, sources, confirmed, expectedVersion } = req.body ?? {};
    if (!SAFE_ID_RE.test(thinkId) || !validThinkInput(values, sources) || confirmed !== true
      || typeof expectedVersion !== 'string' || !Number.isFinite(Date.parse(expectedVersion))) {
      res.status(400).json({ error: 'invalid thinking state or confirmation' }); return;
    }
    const result = await bigqueryService.getRecord(thinkId);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    if (!result.data || result.data.category !== 'bundle') { res.status(404).json({ error: 'bundle not found' }); return; }
    try {
      const meta = toMeta(result.data);
      if (meta.updatedAt !== expectedVersion) { res.status(409).json({ error: 'conflict' }); return; }
      if (meta.metadata != null && (typeof meta.metadata !== 'object' || Array.isArray(meta.metadata))) throw new Error('invalid metadata');
      const previousMetadata = meta.metadata as Record<string, unknown> | undefined;
      const previous = readThinkSupport(previousMetadata?.thinkSupport);
      const now = new Date(Math.max(Date.now(), Date.parse(expectedVersion) + 1)).toISOString();
      const record = { schemaVersion: 1, revision: (previous?.revision ?? 0) + 1, values, sources, author: 'human', confirmedAt: now, updatedAt: now };
      const metadata = { ...previousMetadata, thinkSupport: record };
      const saved = await bigqueryService.saveThinkSupport(thinkId, expectedVersion, metadata, now);
      if (!saved.success) { res.status(500).json({ error: saved.error }); return; }
      if (!saved.data) { res.status(409).json({ error: 'conflict' }); return; }
      res.json({ ...meta, metadata, updatedAt: now });
    } catch { res.status(422).json({ error: 'unsupported stored thinking state' }); }
  });

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
    const result = await bigqueryService.getBody(fileId);
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
    const { thinkid, category, title, content, keywords, relatedIds, metadata, baseUpdatedAt } = req.body as {
      thinkid: string; category: string;
      title: string; content: string;
      keywords?: string; relatedIds?: string;
      metadata?: any;
      baseUpdatedAt?: string;
    };
    if (!thinkid || !category) {
      res.status(400).json({ error: 'thinkid, category are required' }); return;
    }
    if (!SAFE_ID_RE.test(thinkid)) {
      res.status(400).json({ error: 'thinkid contains invalid characters' }); return;
    }
    if (!isValidCategory(category)) {
      res.status(400).json({ error: `unsupported category: ${category}` }); return;
    }
    let fileDate = new Date();
    // 日付 ID（サフィックス -memo, -a3f9 等を含む場合も先頭の日時部分を採用）
    const dateMatch = thinkid.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\w+)?$/);
    if (dateMatch) {
      const [_, yyyy, MM, dd, HH, mm, ss] = dateMatch;
      fileDate = new Date(`${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}+09:00`);
    }
    const fileTimeStr = fileDate.toISOString();
    const nowStr = new Date().toISOString();

    // 楽観ロック（PROJECT_REVIEW_REPORT.md D-2）: baseUpdatedAt が渡され、かつサーバー側の
    // 現在レコードがそれより新しければ、無警告上書きせず 409 を返す。
    if (baseUpdatedAt) {
      if (typeof baseUpdatedAt !== 'string' || !Number.isFinite(Date.parse(baseUpdatedAt))) {
        res.status(400).json({ error: 'invalid baseUpdatedAt' }); return;
      }
      const existing = await bigqueryService.getRecord(thinkid);
      if (!existing.success) { res.status(500).json({ error: existing.error }); return; }
      if (!existing.data) { res.status(409).json({ error: 'conflict' }); return; }
      if (existing.success && existing.data && isServerNewer(baseUpdatedAt, existing.data.updated_at)) {
        const serverUpdatedAt = typeof existing.data.updated_at === 'object' && existing.data.updated_at !== null
          ? (existing.data.updated_at as { value: string }).value
          : String(existing.data.updated_at);
        res.status(409).json({ error: 'conflict', serverUpdatedAt });
        return;
      }
    }

    const record: VaultRecord = {
      thinkid,
      file_type:   'md',
      category,
      title:       title ?? null,
      content:     content ?? null,
      keywords:    keywords ?? null,
      related_ids: relatedIds ?? null,
      size_bytes:  content ? Buffer.byteLength(content, 'utf8') : null,
      is_deleted:  false,
      created_at:  fileTimeStr,
      updated_at:  nowStr,
      metadata:    metadata ? yaml.dump(metadata) : null,
    };
    const result = await bigqueryService.save(record, 3, baseUpdatedAt);
    if (!result.success) { res.status(result.error === 'conflict' ? 409 : 500).json({ error: result.error }); return; }
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

      // 保存先ディレクトリを作成
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      exportStatus = {
        running: true,
        total: records.length,
        current: 0,
        path: exportDir
      };

      const exportDirResolved = path.resolve(exportDir) + path.sep;

      for (const r of records) {
        // title は YAML frontmatter 側に持つため、本文には含めない（重複を避ける）。
        const body = r.content ?? '';
        const thinkId = r.thinkid;
        const category = r.category || 'unknown';

        // 既存レコードに旧バージョン由来の不正な thinkid/category が混入している
        // 可能性を考慮し、書き込み先が exportDir 配下から外れないことを検証する。
        if (!SAFE_ID_RE.test(thinkId) || !SAFE_ID_RE.test(category)) {
          console.warn(`[bigqueryRoutes] export: skip unsafe thinkid/category (${thinkId} / ${category})`);
          exportStatus.current++;
          continue;
        }

        let targetPath = '';
        if (category === 'memo') {
          targetPath = path.join(exportDir, `${thinkId}.md`);
        } else {
          const categoryDir = path.join(exportDir, category);
          if (!fs.existsSync(categoryDir)) {
            fs.mkdirSync(categoryDir, { recursive: true });
          }
          targetPath = path.join(categoryDir, `${thinkId}.md`);
        }

        if (!path.resolve(targetPath).startsWith(exportDirResolved)) {
          console.warn(`[bigqueryRoutes] export: blocked path traversal attempt (${thinkId})`);
          exportStatus.current++;
          continue;
        }

        // metadata の有無によらず、レコードの識別情報を常に YAML frontmatter として
        // 本文の先頭に配置する（metadata が空のレコードだけ frontmatter が無くなる問題を防ぐ）。
        const storedMetadata = r.metadata ? (typeof r.metadata === 'string' ? yaml.load(r.metadata) : r.metadata) : null;
        const bqDateToIso = (v: typeof r.created_at) =>
          v == null ? '' : typeof v === 'object' ? (v as unknown as { value: string }).value : String(v);
        const frontmatterObj = {
          ...(storedMetadata && typeof storedMetadata === 'object' ? storedMetadata : {}),
          thinkid:    thinkId,
          category,
          title:      r.title ?? '',
          is_deleted: r.is_deleted ?? false,
          created_at: bqDateToIso(r.created_at),
          updated_at: bqDateToIso(r.updated_at),
        };
        const frontmatter = `---\n${yaml.dump(frontmatterObj)}---\n`;
        await fs.promises.writeFile(targetPath, frontmatter + body, 'utf8');

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
