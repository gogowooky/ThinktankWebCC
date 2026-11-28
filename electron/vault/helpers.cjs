'use strict';

/**
 * electron/vault/helpers.cjs
 * VaultEngine の各部品が使う小さな関数と定数。
 */

const fs = require('fs');
const os = require('os');

function hostnameToken() {
  return os.hostname().replace(/[^A-Za-z0-9_-]/g, '_');
}

/** trash/ の退避名に使う日時。同期フォルダ上でも並び順が分かり、ファイル名に使えない文字を含まない。 */
function fileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** thinkid には '.' が入らないので、退避名 <thinkid>.<理由>-<日時>.md の先頭が thinkid になる。 */
function thinkIdFromTrashName(fileName) {
  return fileName.split('.')[0];
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** 移行で上書きされた版の退避（<id>.overwritten-…）は削除ではないので数えない */
function isTrashDeletion(fileName) {
  return fileName.endsWith('.md') && (!fileName.slice(0, -3).includes('.') || fileName.includes('.deleted-'));
}

const META_READ_BATCH = 40;

/** 追記がこの大きさになったら全体へ書き戻す（1 件あたり数 KB なので千回に一度ほど）。 */
const OVERLAY_JOURNAL_MAX_BYTES = 4 * 1024 * 1024;

module.exports = {
  hostnameToken,
  fileTimestamp,
  thinkIdFromTrashName,
  readJsonFile,
  isTrashDeletion,
  META_READ_BATCH,
  OVERLAY_JOURNAL_MAX_BYTES,
};
