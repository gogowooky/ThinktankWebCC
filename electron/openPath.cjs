'use strict';

const fs = require('fs');
const path = require('path');

// 関連付けを介して即座にコードが実行される拡張子。ノート内のパスを開くという
// 本来の用途（文書・画像・フォルダ）に実行可能ファイルは含まれないため拒否する。
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.com', '.scr', '.pif', '.msi', '.msp', '.cpl', '.dll',
  '.bat', '.cmd', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse',
  '.wsf', '.wsh', '.hta', '.jar', '.reg', '.lnk', '.url', '.inf',
  '.sh', '.bash', '.zsh', '.command', '.app', '.desktop',
]);

/**
 * 「ローカルの文書を既定のアプリで開く」ためのパス検証。
 * 画面から渡る文字列なので、任意の実行ファイルを起動する手段になってはならない。
 * @param {unknown} input
 * @returns {{ ok: true, resolved: string } | { ok: false, reason: string }}
 */
function validateOpenPath(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'path is required' };
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'path is empty' };

  // NUL 混入によるパス切り詰めを防ぐ
  if (raw.includes('\0')) return { ok: false, reason: 'path contains NUL' };

  // UNC パス（\\server\share\payload.exe）はリモートの実行ファイルを掴まされる
  if (raw.startsWith('\\\\') || raw.startsWith('//')) {
    return { ok: false, reason: 'UNC path is not allowed' };
  }

  // file:// 等のスキーム付き入力は対象外（相対パスも曖昧なので拒否）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    return { ok: false, reason: 'URL is not allowed' };
  }
  if (!path.isAbsolute(raw)) return { ok: false, reason: 'path must be absolute' };

  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) return { ok: false, reason: 'path does not exist' };

  // ディレクトリはエクスプローラで開くだけなので許可する
  if (fs.statSync(resolved).isDirectory()) return { ok: true, resolved };

  if (BLOCKED_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    return { ok: false, reason: 'executable file type is not allowed' };
  }
  return { ok: true, resolved };
}

module.exports = { validateOpenPath };
