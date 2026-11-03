'use strict';

/**
 * electron/appMode.cjs
 * PC版の運用モード（Firestore / ローカル）と ThinkファイルFolder の設定。
 * モードは起動時に一度だけ決め、切り替えは再起動で反映する（docs/261103/ローカル運用モード.md）。
 */

const fs = require('fs');
const path = require('path');

const MODE_FILE = 'app-mode.json';
const LOCAL_SUBDIRS = ['thinks', 'snapshots', 'trash', path.join('system', 'index')];

function modeFilePath(userDataDir) {
  return path.join(userDataDir, MODE_FILE);
}

function normalizeMode(raw) {
  const storageMode = raw && raw.storageMode === 'local' ? 'local' : 'firestore';
  const localVaultDir = raw && typeof raw.localVaultDir === 'string' ? raw.localVaultDir.trim() : '';
  return { storageMode, localVaultDir };
}

function loadAppMode(userDataDir) {
  try {
    return normalizeMode(JSON.parse(fs.readFileSync(modeFilePath(userDataDir), 'utf8')));
  } catch {
    return normalizeMode(null);
  }
}

function saveAppMode(userDataDir, mode) {
  const normalized = normalizeMode(mode);
  fs.mkdirSync(userDataDir, { recursive: true });
  const target = modeFilePath(userDataDir);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, target);
  return normalized;
}

/** Firestore モードの Markdown バックアップ先（VaultEngine の vaultDir 設定）を、エンジンを作らずに求める。 */
function resolveBackupVaultRoot(userDataDir, defaultVaultDir) {
  let vaultDir = defaultVaultDir;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(userDataDir, 'vault-engine-config.json'), 'utf8'));
    if (cfg && typeof cfg.vaultDir === 'string' && cfg.vaultDir.trim()) vaultDir = cfg.vaultDir.trim();
  } catch {
    // 設定が無ければ既定のバックアップ先
  }
  const resolved = path.resolve(vaultDir);
  return path.basename(resolved) === 'vault_ver2' ? path.dirname(resolved) : resolved;
}

function isSameOrNested(a, b) {
  const x = path.resolve(a).toLowerCase();
  const y = path.resolve(b).toLowerCase();
  if (x === y) return true;
  const rel = path.relative(x, y);
  const relBack = path.relative(y, x);
  const inside = (r) => r && !r.startsWith('..') && !path.isAbsolute(r);
  return inside(rel) || inside(relBack);
}

/**
 * ThinkファイルFolder として使えるか調べる。バックアップ先と同じ・入れ子のフォルダは、
 * 両方のモードが同じ .md に書き込んでデータが混ざるので拒否する。
 */
function validateLocalVaultDir(dir, backupVaultRoot) {
  const raw = typeof dir === 'string' ? dir.trim() : '';
  if (!raw) return { ok: false, error: 'ThinkファイルFolder を指定してください。' };
  if (!path.isAbsolute(raw)) return { ok: false, error: 'ThinkファイルFolder は C:\\ などから始まる絶対パスで指定してください。' };
  const resolved = path.resolve(raw);
  if (backupVaultRoot && isSameOrNested(resolved, backupVaultRoot)) {
    return {
      ok: false,
      error: `Firestore 運用のバックアップ先（${backupVaultRoot}）と同じか重なるフォルダは指定できません。別のフォルダを指定してください。`,
    };
  }
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: `フォルダではなくファイルが指定されています: ${resolved}` };
  }
  return { ok: true, resolved };
}

/** フォルダが無ければ作り、thinks/ snapshots/ trash/ system/ を揃える。既存のファイルには触れない。 */
function prepareLocalVaultDir(resolvedDir) {
  for (const sub of ['', ...LOCAL_SUBDIRS]) {
    fs.mkdirSync(path.join(resolvedDir, sub), { recursive: true });
  }
}

module.exports = {
  loadAppMode,
  saveAppMode,
  resolveBackupVaultRoot,
  validateLocalVaultDir,
  prepareLocalVaultDir,
};
