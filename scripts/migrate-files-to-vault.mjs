/**
 * migrate-files-to-vault.mjs (v3)
 *
 * thinktank.files → thinktank.vault マイグレーションスクリプト（高速版）
 *
 * 修正点 (v3):
 *  - 改行コード正規化: CR+LF / CR のみ → LF に統一してから title を抽出
 *  - SQLテンプレートリテラル内のエスケープ問題を回避するため
 *    CHAR(13) / CHAR(10) を使って改行文字を参照する
 *  - BOM除去・付与は CODE_POINTS_TO_STRING([65279]) で実施
 */

import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

// ── 環境変数ロード ──────────────────────────────────────────────────────
config({ path: 'server/.env', override: true });

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
if (keyPath) {
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = readFileSync(keyPath, 'utf8');
}

const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
if (!credentials) {
  console.error('[migrate] GOOGLE_SERVICE_ACCOUNT_KEY が設定されていません');
  process.exit(1);
}

const keyFile   = JSON.parse(credentials);
const projectId = keyFile.project_id;

const bigquery = new BigQuery({ projectId, credentials: keyFile });

const DATASET  = 'thinktank';
const SRC_TBL  = `\`${projectId}.${DATASET}.files\``;
const DST_TBL  = `\`${projectId}.${DATASET}.vault\``;

// ── メイン処理 ──────────────────────────────────────────────────────────

async function main() {
  console.log(`[migrate] プロジェクト: ${projectId}`);
  console.log(`[migrate] ソース: ${SRC_TBL}`);
  console.log(`[migrate] 宛先 : ${DST_TBL}`);
  console.log('');

  // ── STEP 1: vault を全件物理削除 ──────────────────────────────────────
  console.log('[migrate] STEP 1: thinktank.vault を全件削除中...');
  const [deleteJob] = await bigquery.createQueryJob({
    query: `DELETE FROM ${DST_TBL} WHERE TRUE`
  });
  await deleteJob.getQueryResults();
  console.log('[migrate] STEP 1: 削除完了');
  console.log('');

  // ── STEP 2: files から Memo/memos を件数確認 ─────────────────────────
  console.log('[migrate] STEP 2: 対象件数を確認中...');
  const [countRows] = await bigquery.query({
    query: `
      SELECT COUNT(DISTINCT file_id) AS cnt
      FROM ${SRC_TBL}
      WHERE category IN ('Memo', 'memos')
    `
  });
  const distinctCount = Number(countRows[0]?.cnt ?? 0);
  console.log(`[migrate] STEP 2: ユニークfile_id数 = ${distinctCount} 件`);
  console.log('');

  // ── STEP 3: INSERT INTO vault ... SELECT FROM files (単一クエリ) ──────
  //
  // 改行コード正規化の方針:
  //   BigQuery の STRING は UTF-8 コードポイント単位。
  //   REPLACE を2段階でかけて CR+LF → LF, CR → LF と変換する。
  //   SQL文字列リテラル内で改行文字を書く場合:
  //     LF  = CODE_POINTS_TO_STRING([10])
  //     CR  = CODE_POINTS_TO_STRING([13])
  //     BOM = CODE_POINTS_TO_STRING([65279])
  //   これにより JavaScript テンプレートリテラルのエスケープ問題を完全回避。
  //
  console.log('[migrate] STEP 3: INSERT INTO vault ... SELECT FROM files を実行中...');
  console.log('         (BigQuery 上で一括処理します。完了まで少しお待ちください...)');

  const insertQuery = `
    INSERT INTO ${DST_TBL}
      (file_id, file_type, category, title, content,
       keywords, related_ids, size_bytes, is_deleted, created_at, updated_at)

    WITH
    chars AS (
      SELECT
        CODE_POINTS_TO_STRING([65279]) AS bom,
        CODE_POINTS_TO_STRING([13])    AS cr,
        CODE_POINTS_TO_STRING([10])    AS lf
    ),
    deduped AS (
      SELECT
        file_id,
        content,
        ROW_NUMBER() OVER (PARTITION BY file_id ORDER BY updated_at DESC NULLS LAST) AS rn
      FROM ${SRC_TBL}
      WHERE category IN ('Memo', 'memos')
    ),
    normalized AS (
      -- 1) CR+LF を LF に置換
      -- 2) 残った CR を LF に置換
      -- 3) 先頭の BOM を除去
      SELECT
        d.file_id,
        c.bom,
        c.lf,
        IF(
          STARTS_WITH(
            REPLACE(REPLACE(COALESCE(d.content, ''), c.cr || c.lf, c.lf), c.cr, c.lf),
            c.bom
          ),
          SUBSTR(
            REPLACE(REPLACE(COALESCE(d.content, ''), c.cr || c.lf, c.lf), c.cr, c.lf),
            2
          ),
          REPLACE(REPLACE(COALESCE(d.content, ''), c.cr || c.lf, c.lf), c.cr, c.lf)
        ) AS raw_content
      FROM deduped d, chars c
      WHERE d.rn = 1
    )
    SELECT
      file_id,
      'md'                                                       AS file_type,
      'memo'                                                     AS category,

      -- title: 改行正規化・BOM除去済み content の1行目（空はNULL）
      NULLIF(TRIM(SPLIT(raw_content, lf)[SAFE_OFFSET(0)]), '')  AS title,

      -- content: BOM付きで書き出す
      CONCAT(bom, raw_content)                                   AS content,

      CAST(NULL AS STRING)                                       AS keywords,
      CAST(NULL AS STRING)                                       AS related_ids,

      -- size_bytes: BOM 3byte + raw_content のバイト数
      CAST(3 + BYTE_LENGTH(raw_content) AS INT64)                AS size_bytes,

      FALSE                                                      AS is_deleted,

      -- file_id を yyyy-MM-dd-hhmmss として JST → UTC に変換
      COALESCE(
        SAFE.PARSE_TIMESTAMP('%Y-%m-%d-%H%M%S', file_id, 'Asia/Tokyo'),
        CURRENT_TIMESTAMP()
      )                                                          AS created_at,

      COALESCE(
        SAFE.PARSE_TIMESTAMP('%Y-%m-%d-%H%M%S', file_id, 'Asia/Tokyo'),
        CURRENT_TIMESTAMP()
      )                                                          AS updated_at

    FROM normalized
  `;

  try {
    const [insertJob] = await bigquery.createQueryJob({ query: insertQuery });
    console.log(`[migrate] ジョブID: ${insertJob.id}`);
    await insertJob.getQueryResults();

    const [meta] = await insertJob.getMetadata();
    const stats = meta.statistics?.query;
    console.log(`[migrate] 処理バイト数: ${stats?.totalBytesProcessed ?? '?'} bytes`);
    console.log('');
    console.log('── 完了 ──────────────────────────────────────────────────');
    console.log(`  対象ユニーク件数: ${distinctCount} 件`);
    console.log('  ステータス: 成功');

  } catch (e) {
    console.error('[migrate] INSERT エラー:', e);
    process.exit(1);
  }

  // ── STEP 4: 結果確認 ────────────────────────────────────────────────
  console.log('');
  console.log('[migrate] STEP 4: vault の件数を確認中...');
  const [verifyRows] = await bigquery.query({
    query: `SELECT COUNT(*) AS cnt FROM ${DST_TBL} WHERE COALESCE(is_deleted, FALSE) = FALSE`
  });
  const vaultCount = Number(verifyRows[0]?.cnt ?? 0);
  console.log(`[migrate] vault 件数: ${vaultCount} 件`);
}

main().catch(e => {
  console.error('[migrate] 致命的エラー:', e);
  process.exit(1);
});
