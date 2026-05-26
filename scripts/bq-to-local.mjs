/**
 * scripts/bq-to-local.mjs
 * BigQuery vault テーブルからローカルの Electron vault ディレクトリへデータをコピーする。
 * 使用法: node scripts/bq-to-local.mjs
 *
 * 保存先: %APPDATA%\thinktank\thinktank\vault\{id}.json
 */

import { BigQuery }   from '@google-cloud/bigquery';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir }    from 'os';
import { fileURLToPath } from 'url';
import { config }     from 'dotenv';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// ── 環境変数読み込み ───────────────────────────────────────────────────────
config({ path: join(projectRoot, 'server', '.env') });
const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
if (!keyPath) { console.error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE not set'); process.exit(1); }

// キーファイルはプロジェクトルート基準
const absoluteKeyPath = existsSync(join(projectRoot, keyPath))
  ? join(projectRoot, keyPath)
  : join(projectRoot, 'server', keyPath);
if (!existsSync(absoluteKeyPath)) {
  console.error(`Service account key not found: ${absoluteKeyPath}`);
  process.exit(1);
}
const keyFile   = JSON.parse(readFileSync(absoluteKeyPath, 'utf8'));
const projectId = keyFile.project_id;

// ── ローカル vault パス ────────────────────────────────────────────────────
// Electron app.getPath('userData') on Windows = %APPDATA%\{appName}
// app name = 'thinktank' → C:\Users\{user}\AppData\Roaming\thinktank
const appData  = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const vaultDir = join(appData, 'thinktank', 'thinktank', 'vault');
mkdirSync(vaultDir, { recursive: true });
console.log(`[bq-to-local] Vault directory: ${vaultDir}`);

// ── BigQuery 接続 ──────────────────────────────────────────────────────────
const bq = new BigQuery({ projectId, credentials: keyFile });
const TABLE = `\`${projectId}.thinktank.vault\``;

// ── メタ一覧取得 ───────────────────────────────────────────────────────────
console.log('[bq-to-local] Fetching metadata from BigQuery...');
const metaQuery = `
  SELECT t.file_id, t.file_type, t.category, t.title,
         t.keywords, t.related_ids, t.size_bytes,
         COALESCE(t.is_deleted, FALSE) AS is_deleted,
         t.created_at, t.updated_at
  FROM ${TABLE} t
  INNER JOIN (
    SELECT file_id, MAX(updated_at) AS max_upd
    FROM ${TABLE}
    WHERE COALESCE(is_deleted, FALSE) = FALSE
    GROUP BY file_id
  ) latest ON t.file_id = latest.file_id AND t.updated_at = latest.max_upd
  WHERE COALESCE(t.is_deleted, FALSE) = FALSE
  ORDER BY t.updated_at DESC
`;

const [metas] = await bq.query({ query: metaQuery });
console.log(`[bq-to-local] Found ${metas.length} entries`);

// ── コンテンツ取得＆ローカル書き込み ────────────────────────────────────
let added = 0, updated = 0, skipped = 0;

for (const meta of metas) {
  const localPath = join(vaultDir, `${meta.file_id}.json`);

  // 既存ファイルより新しい場合のみ更新
  if (existsSync(localPath)) {
    try {
      const existing = JSON.parse(readFileSync(localPath, 'utf8'));
      const bqUpdated  = new Date(meta.updated_at?.value ?? meta.updated_at).toISOString();
      if (existing.updatedAt >= bqUpdated) { skipped++; continue; }
    } catch { /* parse error: overwrite */ }
  }

  // コンテンツを取得
  const contentQuery = `
    SELECT content FROM ${TABLE}
    WHERE file_id = @fileId
    ORDER BY updated_at DESC LIMIT 1
  `;
  const [rows] = await bq.query({ query: contentQuery, params: { fileId: meta.file_id } });
  const content = rows[0]?.content ?? '';

  const toIso = (v) => {
    if (!v) return '';
    if (v?.value) return new Date(v.value).toISOString();
    return new Date(v).toISOString();
  };

  const record = {
    id:          meta.file_id,
    contentType: meta.category ?? 'memo',
    title:       meta.title      ?? '',
    content:     content         ?? '',
    keywords:    meta.keywords   ?? null,
    relatedIds:  meta.related_ids ?? null,
    sizeBytes:   meta.size_bytes  ?? 0,
    isDeleted:   meta.is_deleted  ?? false,
    createdAt:   toIso(meta.created_at),
    updatedAt:   toIso(meta.updated_at),
  };

  const isNew = !existsSync(localPath);
  writeFileSync(localPath, JSON.stringify(record, null, 2), 'utf8');
  isNew ? added++ : updated++;

  if ((added + updated) % 50 === 0) {
    process.stdout.write(`\r  processed: ${added + updated} / ${metas.length} ...`);
  }
}

console.log(`\n[bq-to-local] Done. added=${added}, updated=${updated}, skipped=${skipped}, total=${metas.length}`);
console.log(`[bq-to-local] Files saved to: ${vaultDir}`);
