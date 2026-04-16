/**
 * obsidianRoutes.ts
 * Obsidian Vault → BigQuery 同期エンドポイント
 *
 * 環境変数:
 *   OBSIDIAN_VAULT_PATH  - Obsidian Vault のルートパス
 *
 * POST /api/obsidian/sync
 *   Vault 内の .md ファイルを再帰スキャンし、BQ の更新日と比較して
 *   新規・更新ファイルを category='obsidian' で保存する。
 *
 * ファイル識別:
 *   file_id = "obs-{Vault ルートからの相対パス (/ 区切り)}"
 *   例: obs-Projects/Meeting Notes/2025-04-01.md
 */

import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { bigqueryService, type FileRecord } from '../services/BigQueryService.js';

// ─── ユーティリティ ───────────────────────────────────────────────────────────

/** BQ タイムスタンプ（Date | {value:string} | string）→ Date に正規化 */
function toDate(ts: unknown): Date {
  if (ts instanceof Date) return ts;
  if (typeof ts === 'object' && ts !== null && 'value' in (ts as Record<string, unknown>)) {
    return new Date((ts as { value: string }).value);
  }
  return new Date(String(ts));
}

/** ディレクトリを再帰スキャンして .md ファイルのフルパス一覧を返す */
async function findMarkdownFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    // 隠しディレクトリ（.obsidian 等）はスキップ
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await findMarkdownFiles(fullPath);
      files.push(...sub);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

// ─── ルート ──────────────────────────────────────────────────────────────────

export function createObsidianRoutes(): Router {
  const router = Router();

  /**
   * POST /api/obsidian/sync
   *
   * レスポンス:
   *   { synced: number, unchanged: number, total: number, errors: string[], vaultPath: string }
   */
  router.post('/sync', async (_req, res) => {
    const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
    if (!vaultPath) {
      return res.status(400).json({
        error: 'OBSIDIAN_VAULT_PATH が設定されていません。サーバーの環境変数を確認してください。',
      });
    }

    // Vault パスの存在確認
    try {
      await fs.access(vaultPath);
    } catch {
      return res.status(400).json({
        error: `Vault パスにアクセスできません: ${vaultPath}`,
      });
    }

    console.log(`[ObsidianSync] Starting sync: ${vaultPath}`);

    try {
      // 1. .md ファイルを再帰スキャン
      const mdFiles = await findMarkdownFiles(vaultPath);
      console.log(`[ObsidianSync] Found ${mdFiles.length} markdown files`);

      // 2. BQ の obsidian カテゴリのバージョン情報を取得
      const versionResult = await bigqueryService.getVersions('obsidian');
      const versionMap = new Map<string, Date>();
      if (versionResult.success && versionResult.data) {
        for (const v of versionResult.data) {
          versionMap.set(v.file_id, toDate(v.updated_at));
        }
      }
      console.log(`[ObsidianSync] BQ has ${versionMap.size} existing obsidian records`);

      // 3. ファイルごとに差分チェック → 保存リストを構築
      const toSave: FileRecord[] = [];
      const errors: string[] = [];
      let unchanged = 0;

      for (const filePath of mdFiles) {
        const relPath = path.relative(vaultPath, filePath).replace(/\\/g, '/');
        const fileId = `obs-${relPath}`;

        try {
          const stat = await fs.stat(filePath);
          const mtime = stat.mtime;

          // BQ に同一バージョンが存在する場合はスキップ
          const bqTime = versionMap.get(fileId);
          if (bqTime && bqTime >= mtime) {
            unchanged++;
            continue;
          }

          const content = await fs.readFile(filePath, 'utf-8');
          const title = path.basename(filePath, path.extname(filePath));

          toSave.push({
            file_id: fileId,
            title,
            file_type: 'obsidian',
            category: 'obsidian',
            content,
            metadata: { vault_path: relPath },
            size_bytes: stat.size,
            created_at: stat.birthtime,
            updated_at: mtime,
          });
        } catch (err) {
          const msg = `${relPath}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
          console.warn(`[ObsidianSync] File error: ${msg}`);
        }
      }

      console.log(`[ObsidianSync] To sync: ${toSave.length}, unchanged: ${unchanged}`);

      // 4. BQ に保存（直列送信で同時実行エラー回避）
      let synced = 0;
      for (const record of toSave) {
        const result = await bigqueryService.saveFile(record);
        if (result.success) {
          synced++;
        } else {
          errors.push(`${record.file_id}: ${result.error}`);
        }
      }

      console.log(`[ObsidianSync] Done: synced=${synced}, unchanged=${unchanged}, errors=${errors.length}`);

      return res.json({
        synced,
        unchanged,
        total: mdFiles.length,
        errors,
        vaultPath,
      });
    } catch (error) {
      console.error('[ObsidianSync] Unexpected error:', error);
      return res.status(500).json({ error: String(error) });
    }
  });

  return router;
}
