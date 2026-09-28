'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFrontmatter, serialize, extractMetadata } = require('./mdFormat.cjs');

// The lock file also serializes writes from a second app instance.
function saveVaultRecord(directory, payload) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(payload.thinkid)) throw new Error('不正なThink IDです。');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${payload.thinkid}.md`);
  const lock = `${file}.lock`;
  let handle;
  try { handle = fs.openSync(lock, 'wx'); }
  catch { throw new Error('別のアプリが同じ記録を保存中です。少し待って再試行してください。'); }
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const previousFm = fs.existsSync(file) ? parseFrontmatter(fs.readFileSync(file, 'utf8')).meta : null;
    if (payload.baseUpdatedAt && previousFm?.updated_at !== payload.baseUpdatedAt) throw new Error('記録が別の場所で更新されました。開き直してから変更してください。');
    const now = new Date(Math.max(Date.now(), (Date.parse(previousFm?.updated_at) || 0) + 1)).toISOString();
    const nl = payload.fullContent.indexOf('\n');
    const title = nl < 0 ? payload.fullContent : payload.fullContent.slice(0, nl);
    const body  = nl < 0 ? '' : payload.fullContent.slice(nl + 1);
    const metadataObj = payload.metadata ?? (previousFm ? extractMetadata(previousFm) : {});
    const frontmatterObj = {
      ...metadataObj,
      thinkid:     payload.thinkid,
      category:    payload.category,
      title,
      keywords:    payload.keywords || null,
      related_ids: payload.relatedIds || null,
      size_bytes:  Buffer.byteLength(payload.fullContent, 'utf8'),
      is_deleted:  false,
      created_at:  previousFm?.created_at || now,
      updated_at:  now,
    };
    fs.writeFileSync(temporary, serialize(frontmatterObj, body), 'utf8');
    fs.renameSync(temporary, file);
    return {
      thinkid:     frontmatterObj.thinkid,
      category:    frontmatterObj.category,
      title:       frontmatterObj.title,
      keywords:    frontmatterObj.keywords,
      relatedIds:  frontmatterObj.related_ids,
      sizeBytes:   frontmatterObj.size_bytes,
      isDeleted:   frontmatterObj.is_deleted,
      createdAt:   frontmatterObj.created_at,
      updatedAt:   frontmatterObj.updated_at,
      metadata:    metadataObj,
    };
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    fs.closeSync(handle); fs.unlinkSync(lock);
  }
}
module.exports = { saveVaultRecord };
