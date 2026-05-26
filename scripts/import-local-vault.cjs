'use strict';
/**
 * import-local-vault.cjs
 * C# Local vault (MD frontmatter) → Electron vault (JSON) 変換インポートスクリプト
 *
 * 使い方: node scripts/import-local-vault.cjs
 */

const fs   = require('fs');
const path = require('path');

const SOURCE_DIR    = 'C:\\Users\\gogow\\Documents\\ThinktankLocal\\vault';
const ELECTRON_VAULT = process.env.ELECTRON_VAULT
  || 'C:\\Users\\gogow\\AppData\\Roaming\\Electron\\thinktank\\vault';

// contentType: C# は複数形 → アプリは単数形
const CONTENT_TYPE_NORM = { memos: 'memo', chats: 'chat' };
// どのサブディレクトリを対象にするか（大文字フォルダも含む）
const SUBDIR_CONTENT_TYPE = {
  thought : 'thought',
  memos   : 'memo',
  Memo    : 'memo',
  links   : 'links',
  chats   : 'chat',
  Chat    : 'chat',
};

// BOM を除去して YAML frontmatter を解析
function parseFrontmatter(raw) {
  const text = raw.replace(/^﻿/, '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: m[2] };
}

if (!fs.existsSync(ELECTRON_VAULT)) {
  fs.mkdirSync(ELECTRON_VAULT, { recursive: true });
  console.log(`Created vault dir: ${ELECTRON_VAULT}`);
}

let converted = 0, skipped = 0, errors = 0;

for (const [subdir, defaultType] of Object.entries(SUBDIR_CONTENT_TYPE)) {
  const dirPath = path.join(SOURCE_DIR, subdir);
  if (!fs.existsSync(dirPath)) continue;

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  console.log(`[${subdir}] ${files.length} files`);

  for (const file of files) {
    try {
      const raw    = fs.readFileSync(path.join(dirPath, file), 'utf8');
      const parsed = parseFrontmatter(raw);
      if (!parsed) { errors++; console.warn(`  SKIP (no frontmatter): ${file}`); continue; }

      const { meta, body } = parsed;
      if (meta.isDeleted === 'true') { skipped++; continue; }

      const id          = meta.id || file.replace('.md', '');
      const rawType     = meta.contentType || defaultType;
      const contentType = CONTENT_TYPE_NORM[rawType] ?? rawType;

      const record = {
        id,
        contentType,
        title      : meta.title       || '',
        content    : body.replace(/\r\n/g, '\n').trimEnd(),
        keywords   : meta.keywords    || null,
        relatedIds : meta.relatedIds  || null,
        sizeBytes  : Buffer.byteLength(raw, 'utf8'),
        isDeleted  : false,
        createdAt  : meta.createdAt   || new Date().toISOString(),
        updatedAt  : meta.updatedAt   || new Date().toISOString(),
      };

      const outPath = path.join(ELECTRON_VAULT, `${id}.json`);
      // 既存ファイルは updatedAt が新しい方を優先
      if (fs.existsSync(outPath)) {
        const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        if (existing.updatedAt >= record.updatedAt) { skipped++; continue; }
      }

      fs.writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf8');
      converted++;
    } catch (e) {
      console.error(`  ERROR: ${file} — ${e.message}`);
      errors++;
    }
  }
}

console.log(`\nDone: ${converted} converted, ${skipped} skipped, ${errors} errors`);
console.log(`Vault: ${ELECTRON_VAULT}`);
