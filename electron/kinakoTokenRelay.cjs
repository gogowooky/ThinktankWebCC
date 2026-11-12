'use strict';

/**
 * electron/kinakoTokenRelay.cjs
 * きなこ（クラウド側 AI）へ Firebase の ID トークンを渡すファイルの置き場所と読み書き。
 * きなこはパスワードを持たず、Google Drive に同期されたこのファイルのトークンを Bearer として使う。
 */

const fs = require('fs');
const path = require('path');

const KINAKO_EMAIL = 'gogowooky+kinako@gmail.com';
const KINAKO_RELAY_DIR_NAME = 'kinako-relay';
const TOKEN_FILE_VERSION = 1;

// mcpServer.cjs / main.cjs の defaultVaultDir 候補と同じ並び
const DRIVE_VAULT_CANDIDATES = [
  'G:\\マイドライブ\\Thinktank\\vault_ver2',
  'G:\\My Drive\\Thinktank\\vault_ver2',
];

/**
 * Drive for Desktop 上の Thinktank フォルダ直下の kinako-relay を返す。Drive が見つからなければ ''。
 * userData 側の代替フォルダは Drive に同期されず、きなこから読めないので使わない。
 */
function resolveKinakoRelayDir(candidates = DRIVE_VAULT_CANDIDATES) {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.join(path.dirname(candidate), KINAKO_RELAY_DIR_NAME);
    }
  }
  return '';
}

function tokenFilePath(relayDir, deviceId) {
  const safeId = String(deviceId || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(relayDir, `token-${safeId}.json`);
}

function buildTokenFileContent({ deviceId, idToken, expiresAtMs, issuedAtMs }) {
  return {
    version: TOKEN_FILE_VERSION,
    pcId: deviceId,
    idToken,
    expiresAt: new Date(expiresAtMs).toISOString(),
    issuedAt: new Date(issuedAtMs).toISOString(),
  };
}

/** Drive 同期が書きかけの内容を拾わないよう、一時ファイルへ書いてから置き換える。 */
function writeTokenFileAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(content, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}

function removeTokenFile(filePath) {
  fs.rmSync(filePath, { force: true });
}

module.exports = {
  KINAKO_EMAIL,
  KINAKO_RELAY_DIR_NAME,
  resolveKinakoRelayDir,
  tokenFilePath,
  buildTokenFileContent,
  writeTokenFileAtomic,
  removeTokenFile,
};
