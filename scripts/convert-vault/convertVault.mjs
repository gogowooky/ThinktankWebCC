/**
 * scripts/convert-vault/convertVault.mjs
 * システム設計メモ §10.4 準拠：
 * BigQuery (thinktank.vault_ver2) からの事前調査・ステージング変換・全件ハッシュ検証ツール。
 * ※ BigQuery に対しては SELECT クエリのみを実行し、本番データは一切変更・削除しない。
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

// server/.env を読み込む
loadDotenv({ path: path.join(rootDir, 'server', '.env') });

// shared-dist を読み込む
const sharedIndexUrl = pathToFileURL(path.join(rootDir, 'electron', 'shared-dist', 'index.js')).href;
const shared = await import(sharedIndexUrl);

function sha256Hex(str) {
  return createHash('sha256').update(Buffer.from(str ?? '', 'utf8')).digest('hex');
}

function toIso(val, fallback = '') {
  if (!val) return fallback;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && 'value' in val) {
    return String(val.value);
  }
  const s = String(val).trim();
  if (!s) return fallback;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : s;
}

function parseMetadataField(rawMeta) {
  if (rawMeta === null || rawMeta === undefined || rawMeta === '') {
    return { metadata: null, rawMetadata: undefined, format: 'empty' };
  }
  if (typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    return {
      metadata: Object.keys(rawMeta).length > 0 ? rawMeta : null,
      rawMetadata: undefined,
      format: 'object',
    };
  }
  const text = String(rawMeta).trim();
  if (!text || text === '{}' || text === 'null') {
    return { metadata: null, rawMetadata: undefined, format: 'empty' };
  }
  try {
    const parsedJson = JSON.parse(text);
    if (typeof parsedJson === 'object' && parsedJson !== null && !Array.isArray(parsedJson)) {
      return {
        metadata: Object.keys(parsedJson).length > 0 ? parsedJson : null,
        rawMetadata: undefined,
        format: 'json',
      };
    }
  } catch {
    // YAML として試行
  }
  try {
    const parsedYaml = yaml.load(text, { schema: yaml.CORE_SCHEMA });
    if (typeof parsedYaml === 'object' && parsedYaml !== null && !Array.isArray(parsedYaml)) {
      return {
        metadata: Object.keys(parsedYaml).length > 0 ? parsedYaml : null,
        rawMetadata: undefined,
        format: 'yaml',
      };
    }
  } catch {
    // 解釈不能な場合は rawMetadata として無손失退避
  }
  return {
    metadata: {},
    rawMetadata: String(rawMeta),
    format: 'raw_fallback',
  };
}

async function initBigQueryReadOnly() {
  let credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credentialsJson && process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
    const keyFilePath = path.resolve(rootDir, 'server', process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
    const altKeyPath = path.resolve(rootDir, process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE);
    const targetPath = existsSync(keyFilePath) ? keyFilePath : altKeyPath;
    if (existsSync(targetPath)) {
      credentialsJson = readFileSync(targetPath, 'utf8');
    }
  }
  if (credentialsJson) {
    const keyFile = JSON.parse(credentialsJson);
    const bq = new BigQuery({ projectId: keyFile.project_id, credentials: keyFile });
    return { bq, projectId: keyFile.project_id };
  }
  const bq = new BigQuery();
  const projectId = await bq.getProjectId();
  return { bq, projectId };
}

async function scanLocalLegacyVaultIds() {
  const appData = process.env.APPDATA || '';
  const legacyDir = path.join(appData, 'thinktank', 'thinktank', 'vault_ver2');
  const ids = new Set();
  if (!existsSync(legacyDir)) {
    return { exists: false, legacyDir, ids };
  }
  const dir = await fs.opendir(legacyDir);
  for await (const dirent of dir) {
    if (dirent.isFile() && dirent.name.endsWith('.md')) {
      ids.add(dirent.name.slice(0, -3));
    }
  }
  return { exists: true, legacyDir, ids };
}

async function main() {
  const stagingRoot = path.join(rootDir, '.staging_vault', 'Thinktank');
  const stagingVaultDir = path.join(stagingRoot, 'vault_ver2');
  const stagingTrashDir = path.join(stagingRoot, 'trash');
  const stagingIndexDir = path.join(stagingRoot, '.thinktank', 'index');

  console.log('=== 手順1：事前調査（BigQuery 読み取り専用クエリ & 旧ローカルVault照合） ===');
  const { bq, projectId } = await initBigQueryReadOnly();
  const tableRef = `\`${projectId}.thinktank.vault_ver2\``;

  const [rows] = await bq.query({
    query: `
      SELECT
        thinkid,
        category,
        title,
        content,
        keywords,
        related_ids,
        size_bytes,
        is_deleted,
        created_at,
        updated_at,
        metadata
      FROM ${tableRef}
      ORDER BY thinkid ASC
    `,
  });

  console.log(`[調査] BigQuery 総取得行数: ${rows.length}`);

  const seenIds = new Map();
  const duplicateIds = [];
  const invalidIds = [];
  const categoryCounts = {};
  let activeCount = 0;
  let deletedCount = 0;
  let metadataNonEmptyCount = 0;
  let metadataRawFallbackCount = 0;

  for (const row of rows) {
    const id = String(row.thinkid ?? '');
    if (!shared.isSafeThinkId(id)) {
      invalidIds.push(id);
    }
    if (seenIds.has(id)) {
      duplicateIds.push(id);
      const prev = seenIds.get(id);
      const prevUpdated = toIso(prev.updated_at);
      const curUpdated = toIso(row.updated_at);
      if (curUpdated >= prevUpdated) {
        seenIds.set(id, row);
      }
    } else {
      seenIds.set(id, row);
    }
  }

  for (const row of seenIds.values()) {
    const isDel = Boolean(row.is_deleted);
    if (isDel) deletedCount++;
    else activeCount++;

    const cat = String(row.category ?? 'memo');
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;

    const parsedMeta = parseMetadataField(row.metadata);
    if (parsedMeta.metadata !== null || parsedMeta.rawMetadata !== undefined) {
      metadataNonEmptyCount++;
    }
    if (parsedMeta.format === 'raw_fallback') {
      metadataRawFallbackCount++;
    }
  }

  const localScan = await scanLocalLegacyVaultIds();
  let localOnlyIds = [];
  let bqOnlyActiveIds = [];
  if (localScan.exists) {
    for (const localId of localScan.ids) {
      if (!seenIds.has(localId)) {
        localOnlyIds.push(localId);
      }
    }
    for (const [id, row] of seenIds.entries()) {
      if (!row.is_deleted && !localScan.ids.has(id)) {
        bqOnlyActiveIds.push(id);
      }
    }
  }

  console.log(`[調査] ユニーク thinkid 数: ${seenIds.size} (有効: ${activeCount}, 削除済: ${deletedCount})`);
  console.log(`[調査] 重複 thinkid 数: ${duplicateIds.length}, 不正 thinkid 数: ${invalidIds.length}`);
  console.log(`[調査] metadata 保有件数: ${metadataNonEmptyCount} (raw退避: ${metadataRawFallbackCount})`);
  console.log(`[調査] カテゴリ内訳:`, categoryCounts);
  if (localScan.exists) {
    console.log(
      `[調査] 旧ローカルVault (.md数: ${localScan.ids.size}) との比較: ローカルのみ=${localOnlyIds.length}件, BigQueryのみ(有効)=${bqOnlyActiveIds.length}件`,
    );
  }

  console.log('\n=== 手順2：ステージングフォルダへの試し変換 ===');
  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(stagingVaultDir, { recursive: true });
  await fs.mkdir(stagingTrashDir, { recursive: true });
  await fs.mkdir(stagingIndexDir, { recursive: true });

  const expectedMap = new Map();
  const activeMetasForIndex = [];
  const activeSearchableForBodyPack = [];
  const deletedIdsForIndex = {};

  for (const [thinkid, row] of seenIds.entries()) {
    const isDeleted = Boolean(row.is_deleted);
    const category = String(row.category ?? 'memo');
    const title = row.title === null || row.title === undefined ? '' : String(row.title);
    const body = row.content === null || row.content === undefined ? '' : String(row.content);
    const keywords =
      row.keywords === null || row.keywords === undefined || row.keywords === ''
        ? null
        : String(row.keywords);
    const relatedIds =
      row.related_ids === null || row.related_ids === undefined || row.related_ids === ''
        ? null
        : String(row.related_ids);
    const updatedAt = toIso(row.updated_at, new Date().toISOString());
    const createdAt = toIso(
      row.created_at,
      shared.inferCreatedAtFromThinkId(thinkid, updatedAt),
    );

    const mdContent = shared.serializeMdRecord({
      thinkid,
      category,
      title,
      keywords,
      relatedIds,
      createdAt,
      updatedAt,
      body,
    });

    const targetDir = isDeleted ? stagingTrashDir : stagingVaultDir;
    await fs.writeFile(path.join(targetDir, `${thinkid}.md`), mdContent, 'utf8');

    const parsedMeta = parseMetadataField(row.metadata);
    let hasSupportFile = false;
    if (parsedMeta.metadata !== null || parsedMeta.rawMetadata !== undefined) {
      hasSupportFile = true;
      const supportContent = shared.serializeSupportFile({
        thinkid,
        updatedAt,
        metadata: parsedMeta.metadata ?? {},
        rawMetadata: parsedMeta.rawMetadata,
      });
      await fs.writeFile(path.join(targetDir, `${thinkid}.support.json`), supportContent, 'utf8');
    }

    const bodySha256 = sha256Hex(body);
    expectedMap.set(thinkid, {
      thinkid,
      isDeleted,
      category,
      title,
      bodySha256,
      bodyByteLength: Buffer.byteLength(body, 'utf8'),
      keywords,
      relatedIds,
      createdAt,
      updatedAt,
      hasSupportFile,
    });

    if (isDeleted) {
      deletedIdsForIndex[thinkid] = updatedAt;
    } else {
      const fullContent = body ? `${title}\n${body}` : title;
      const metaEntry = {
        thinkid,
        category,
        title,
        keywords: keywords ?? '',
        relatedIds: relatedIds ?? '',
        sizeBytes: Buffer.byteLength(fullContent, 'utf8'),
        isDeleted: false,
        createdAt,
        updatedAt,
        metadata: parsedMeta.metadata ?? undefined,
      };
      activeMetasForIndex.push(metaEntry);
      activeSearchableForBodyPack.push({ meta: metaEntry, body });
    }
  }

  // 初期シャード索引 (.thinktank/index/shard-migration-initial.json) の書き出し
  const initialShard = shared.createIndexShard(
    'migration-initial',
    activeMetasForIndex,
    deletedIdsForIndex,
  );
  await fs.writeFile(
    path.join(stagingIndexDir, 'shard-migration-initial.json'),
    JSON.stringify(initialShard, null, 2) + '\n',
    'utf8',
  );

  // Web版オフライン高速全文検索用の初期本文パック (body-pack-migration-initial.json) の書き出し
  if (typeof shared.createBodyPack === 'function') {
    const initialBodyPack = shared.createBodyPack(
      'migration-initial',
      activeSearchableForBodyPack,
    );
    await fs.writeFile(
      path.join(stagingIndexDir, 'body-pack-migration-initial.json'),
      JSON.stringify(initialBodyPack) + '\n',
      'utf8',
    );
  }

  console.log(
    `[変換完了] vault_ver2: ${activeCount}件, trash: ${deletedCount}件, support.json: ${metadataNonEmptyCount}件`,
  );

  console.log('\n=== 手順3：変換結果の全件検証（SHA-256 本文一致・基本項目・往復パース） ===');
  let verifiedActive = 0;
  let verifiedDeleted = 0;
  let verifiedSupport = 0;
  const bodyMismatches = [];
  const fieldMismatches = [];
  const supportErrors = [];

  for (const [thinkid, exp] of expectedMap.entries()) {
    const dir = exp.isDeleted ? stagingTrashDir : stagingVaultDir;
    const mdPath = path.join(dir, `${thinkid}.md`);
    const rawMd = await fs.readFile(mdPath, 'utf8');
    const parsed = shared.parseMdRecord(rawMd, thinkid);

    const actualBodySha256 = sha256Hex(parsed.body);
    if (actualBodySha256 !== exp.bodySha256) {
      bodyMismatches.push({
        thinkid,
        expectedSha256: exp.bodySha256,
        actualSha256: actualBodySha256,
      });
    }

    if (
      parsed.thinkid !== exp.thinkid ||
      parsed.category !== exp.category ||
      parsed.title !== exp.title ||
      parsed.keywords !== exp.keywords ||
      parsed.relatedIds !== exp.relatedIds ||
      parsed.createdAt !== exp.createdAt ||
      parsed.updatedAt !== exp.updatedAt
    ) {
      fieldMismatches.push({
        thinkid,
        expected: {
          category: exp.category,
          title: exp.title,
          keywords: exp.keywords,
          relatedIds: exp.relatedIds,
          createdAt: exp.createdAt,
          updatedAt: exp.updatedAt,
        },
        actual: {
          category: parsed.category,
          title: parsed.title,
          keywords: parsed.keywords,
          relatedIds: parsed.relatedIds,
          createdAt: parsed.createdAt,
          updatedAt: parsed.updatedAt,
        },
      });
    }

    if (exp.hasSupportFile) {
      const supPath = path.join(dir, `${thinkid}.support.json`);
      try {
        const rawSup = await fs.readFile(supPath, 'utf8');
        const parsedSup = shared.parseSupportFile(rawSup, thinkid);
        if (parsedSup.thinkid !== thinkid) {
          supportErrors.push({ thinkid, error: 'thinkid mismatch in support.json' });
        } else {
          verifiedSupport++;
        }
      } catch (err) {
        supportErrors.push({ thinkid, error: String(err) });
      }
    }

    if (exp.isDeleted) verifiedDeleted++;
    else verifiedActive++;
  }

  const allPassed =
    bodyMismatches.length === 0 &&
    fieldMismatches.length === 0 &&
    supportErrors.length === 0 &&
    invalidIds.length === 0 &&
    verifiedActive === activeCount &&
    verifiedDeleted === deletedCount;

  const report = {
    executedAt: new Date().toISOString(),
    projectId,
    sourceTable: `${projectId}.thinktank.vault_ver2`,
    stagingPath: stagingRoot,
    summary: {
      totalRowsFetched: rows.length,
      uniqueRecords: seenIds.size,
      activeRecords: activeCount,
      deletedRecords: deletedCount,
      supportJsonRecords: metadataNonEmptyCount,
      rawMetadataFallbacks: metadataRawFallbackCount,
      duplicateIdsCount: duplicateIds.length,
      invalidIdsCount: invalidIds.length,
      categoryCounts,
    },
    localVaultComparison: {
      localVaultExists: localScan.exists,
      localMdFileCount: localScan.ids.size,
      localOnlyCount: localOnlyIds.length,
      localOnlySample: localOnlyIds.slice(0, 20),
      bqOnlyActiveCount: bqOnlyActiveIds.length,
      bqOnlyActiveSample: bqOnlyActiveIds.slice(0, 20),
    },
    verification: {
      allPassed,
      verifiedActive,
      verifiedDeleted,
      verifiedSupport,
      bodySha256MismatchCount: bodyMismatches.length,
      fieldMismatchCount: fieldMismatches.length,
      supportErrorCount: supportErrors.length,
      bodyMismatches: bodyMismatches.slice(0, 10),
      fieldMismatches: fieldMismatches.slice(0, 10),
      supportErrors: supportErrors.slice(0, 10),
    },
  };

  await fs.writeFile(
    path.join(stagingRoot, 'verification-report.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );

  const mdReportLines = [
    '# BigQuery → Drive 正本形式（形式バージョン1）試し変換・検証レポート',
    '',
    `- **実行日時**: ${report.executedAt}`,
    `- **参照元テーブル**: \`${report.sourceTable}\`（読み取り専用クエリ）`,
    `- **ステージング出力先**: \`${report.stagingPath}\``,
    `- **総合判定**: **${allPassed ? 'PASS（全件完全一致）' : 'FAIL（不一致あり）'}**`,
    '',
    '## 1. 事前調査サマリ（手順1）',
    '',
    '| 項目 | 件数 / 結果 |',
    '| --- | --- |',
    `| BigQuery 取得総行数 | ${report.summary.totalRowsFetched} 件 |`,
    `| ユニーク \`thinkid\` 総数 | ${report.summary.uniqueRecords} 件 |`,
    `| 有効レコード（\`vault_ver2/\` 配置） | ${report.summary.activeRecords} 件 |`,
    `| 削除済みレコード（\`trash/\` 配置） | ${report.summary.deletedRecords} 件 |`,
    `| 思考支援メタデータ保有（\`.support.json\` 出力） | ${report.summary.supportJsonRecords} 件 |`,
    `| \`thinkid\` 重複件数 | ${report.summary.duplicateIdsCount} 件 |`,
    `| 不正ファイル名文字を含む \`thinkid\` | ${report.summary.invalidIdsCount} 件 |`,
    '',
    '### カテゴリ別内訳',
    '',
    '| カテゴリ | 件数 |',
    '| --- | --- |',
    ...Object.entries(categoryCounts).map(([cat, cnt]) => `| \`${cat}\` | ${cnt} 件 |`),
    '',
    '### 旧ローカル Vault（`%APPDATA%\\thinktank\\thinktank\\vault_ver2`）との照合',
    '',
    `- 旧ローカル \`.md\` ファイル数: **${report.localVaultComparison.localMdFileCount} 件**`,
    `- 旧ローカルにのみ存在する \`thinkid\`: **${report.localVaultComparison.localOnlyCount} 件**${
      report.localVaultComparison.localOnlySample.length > 0
        ? `（例: \`${report.localVaultComparison.localOnlySample.join('`, `')}\`）`
        : ''
    }`,
    `- BigQuery（有効分）にのみ存在する \`thinkid\`: **${report.localVaultComparison.bqOnlyActiveCount} 件**${
      report.localVaultComparison.bqOnlyActiveSample.length > 0
        ? `（例: \`${report.localVaultComparison.bqOnlyActiveSample.join('`, `')}\`）`
        : ''
    }`,
    '',
    '## 2. 全件変換・読み戻し検証結果（手順2・手順3）',
    '',
    '| 検証項目（システム設計メモ §10.4） | 結果 |',
    '| --- | --- |',
    `| 有効レコード件数一致（${verifiedActive} / ${activeCount}） | ${verifiedActive === activeCount ? 'OK' : 'NG'} |`,
    `| 削除済みレコード件数一致（${verifiedDeleted} / ${deletedCount}） | ${verifiedDeleted === deletedCount ? 'OK' : 'NG'} |`,
    `| 全件の本文（\`body\`）SHA-256 ハッシュ完全一致 | **不一致 ${bodyMismatches.length} 件**（${bodyMismatches.length === 0 ? 'OK' : 'NG'}） |`,
    `| 全件の基本項目（title / category / keywords / related_ids / created_at / updated_at）一致 | **不一致 ${fieldMismatches.length} 件**（${fieldMismatches.length === 0 ? 'OK' : 'NG'}） |`,
    `| 全 \`.support.json\`（${verifiedSupport} 件）の JSON 往復パース検証 | **エラー ${supportErrors.length} 件**（${supportErrors.length === 0 ? 'OK' : 'NG'}） |`,
    `| 初期シャード索引（\`.thinktank/index/shard-migration-initial.json\`）生成 | OK（${activeMetasForIndex.length} エントリ） |`,
    '',
  ];

  const reportMdPath = path.join(
    rootDir,
    'docs',
    '261016',
    'データ変換検証レポート_BigQuery_to_VaultV1.md',
  );
  await fs.writeFile(reportMdPath, mdReportLines.join('\n'), 'utf8');

  console.log(`[検証完了] allPassed=${allPassed}`);
  console.log(`  - 本文 SHA-256 不一致: ${bodyMismatches.length} 件`);
  console.log(`  - 基本項目 不一致: ${fieldMismatches.length} 件`);
  console.log(`  - support.json エラー: ${supportErrors.length} 件`);
  console.log(`  - レポート出力先: ${reportMdPath}`);

  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[convertVault] Fatal error:', err);
  process.exit(1);
});
