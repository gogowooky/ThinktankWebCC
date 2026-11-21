'use strict';

/**
 * overwriteImport.cjs
 * 「上書き用Thinkファイルフォルダー」の .md を読む（Firestore への上書きコピー用）。
 * ThinkファイルFolder 用の VaultEngine はフォルダに thinks/ 等を作り索引も書くため使わず、読むだけにする。
 * Markdownバックアップ先や ThinkファイルFolder そのものを指定しても、そこには何も書かない。
 */

const fs = require('fs');
const path = require('path');
const shared = require('./shared-dist/index.js');

function resolveSourceDir(dir) {
  const raw = typeof dir === 'string' ? dir.trim() : '';
  if (!raw) throw new Error('上書き用Thinkファイルフォルダーを指定してください。');
  if (!path.isAbsolute(raw)) throw new Error('上書き用Thinkファイルフォルダーは C:\\ などから始まる絶対パスで指定してください。');
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`上書き用Thinkファイルフォルダーが見つかりません: ${resolved}`);
  }
  // ThinkファイルFolder（.md は thinks/ の中）をそのまま指定されても読めるようにする
  const thinksDir = path.join(resolved, 'thinks');
  return fs.existsSync(thinksDir) && fs.statSync(thinksDir).isDirectory() ? thinksDir : resolved;
}

/** フォルダ内の Thinkファイルの thinkid（ファイル名）一覧。同期ソフトの競合コピーは除く */
function listOverwriteIds(dir) {
  const sourceDir = resolveSourceDir(dir);
  return fs.readdirSync(sourceDir)
    .filter((name) => name.toLowerCase().endsWith('.md') && !shared.parseDriveConflictFilename(name))
    .map((name) => name.slice(0, -3))
    .filter((id) => shared.isSafeThinkId(id))
    .sort();
}

function readSupport(sourceDir, thinkid) {
  const supPath = path.join(sourceDir, `${thinkid}.support.json`);
  if (!fs.existsSync(supPath)) return null;
  try {
    return shared.parseSupportFile(fs.readFileSync(supPath, 'utf8'), thinkid);
  } catch (e) {
    console.warn(`[overwriteImport] support.json を読めませんでした (${thinkid}):`, e.message);
    return null;
  }
}

/** 1件を { meta, body } で返す。ファイルが無い・削除済みの Think なら null */
function readOverwriteRecord(dir, thinkid) {
  if (!shared.isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
  const sourceDir = resolveSourceDir(dir);
  const mdPath = path.join(sourceDir, `${thinkid}.md`);
  if (!fs.existsSync(mdPath)) return null;
  const parsed = shared.parseMdRecord(fs.readFileSync(mdPath, 'utf8'), thinkid);
  if (parsed.isDeleted) return null;
  // frontmatter の thinkid がファイル名と違っても、利用者が見て選んだファイル名の ID に書く
  const meta = shared.toVaultThinkMeta({ ...parsed, thinkid }, readSupport(sourceDir, thinkid));
  return { meta, body: parsed.body ?? '' };
}

module.exports = { listOverwriteIds, readOverwriteRecord };
