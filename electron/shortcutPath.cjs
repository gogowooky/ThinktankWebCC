'use strict';

const fs = require('fs');
const path = require('path');

/** Windows .lnk のリンク先解決に渡してよいローカルショートカットか検証する。 */
function validateShortcutPath(input, fileSystem = fs) {
  if (typeof input !== 'string') return { ok: false, reason: 'path is required' };
  const raw = input.trim();
  if (!raw) return { ok: false, reason: 'path is empty' };
  if (raw.includes('\0')) return { ok: false, reason: 'path contains NUL' };
  if (raw.startsWith('\\\\') || raw.startsWith('//')) return { ok: false, reason: 'UNC path is not allowed' };
  if (!path.isAbsolute(raw)) return { ok: false, reason: 'path must be absolute' };
  const resolved = path.resolve(raw);
  if (path.extname(resolved).toLowerCase() !== '.lnk') return { ok: false, reason: 'only .lnk files are allowed' };
  try {
    if (!fileSystem.existsSync(resolved)) return { ok: false, reason: 'path does not exist' };
    if (!fileSystem.statSync(resolved).isFile()) return { ok: false, reason: 'path is not a file' };
  } catch {
    return { ok: false, reason: 'path cannot be read' };
  }
  return { ok: true, resolved };
}

module.exports = { validateShortcutPath };
