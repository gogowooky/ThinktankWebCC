'use strict';
/**
 * mdFormat.cjs
 * Electronローカル保存（vault_ver2）の .md + YAML frontmatter 形式を扱う共通ヘルパー。
 * main.cjs（読み取り系）と vaultSave.cjs（書き込み）の双方から参照する。
 */
const yaml = require('js-yaml');

/** frontmatter内で「基本項目」として扱うキー。それ以外はThinkのmetadataとして扱う。 */
const BASE_KEYS = ['thinkid', 'category', 'title', 'keywords', 'related_ids', 'size_bytes', 'is_deleted', 'created_at', 'updated_at'];

/**
 * "---\n<YAML>\n---\n<body>" 形式を分解する。
 * 先頭が "---" で始まらない、または閉じの "---" が無い場合は frontmatter 無しとみなし、
 * ファイル全体を body として扱う（壊れたファイルでも読めなくなることを避ける）。
 */
function parseFrontmatter(raw) {
  const lines = raw.split(/\r\n|\n/);
  if (lines[0] !== '---') return { meta: {}, body: raw };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { end = i; break; }
  }
  if (end === -1) return { meta: {}, body: raw };
  const meta = yaml.load(lines.slice(1, end).join('\n')) || {};
  return { meta: typeof meta === 'object' ? meta : {}, body: lines.slice(end + 1).join('\n') };
}

function serialize(frontmatterObj, body) {
  return `---\n${yaml.dump(frontmatterObj)}---\n${body ?? ''}`;
}

/** frontmatterの生オブジェクトから、BASE_KEYS以外（＝Thinkのmetadata）だけを取り出す */
function extractMetadata(fm) {
  const out = {};
  for (const k of Object.keys(fm)) if (!BASE_KEYS.includes(k)) out[k] = fm[k];
  return out;
}

/** frontmatterの生オブジェクト（snake_case）を ThinkMeta 形状（camelCase）に変換する */
function toThinkMeta(fm) {
  return {
    thinkid:    fm.thinkid,
    category:   fm.category,
    title:      fm.title ?? '',
    keywords:   fm.keywords ?? null,
    relatedIds: fm.related_ids ?? null,
    sizeBytes:  fm.size_bytes ?? 0,
    isDeleted:  fm.is_deleted ?? false,
    createdAt:  fm.created_at,
    updatedAt:  fm.updated_at,
    metadata:   extractMetadata(fm),
  };
}

module.exports = { parseFrontmatter, serialize, extractMetadata, toThinkMeta, BASE_KEYS };
