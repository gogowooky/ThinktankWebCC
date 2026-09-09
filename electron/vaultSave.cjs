'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// The lock file also serializes writes from a second app instance.
function saveVaultRecord(directory, payload) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(payload.id)) throw new Error('不正なThink IDです。');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${payload.id}.json`);
  const lock = `${file}.lock`;
  let handle;
  try { handle = fs.openSync(lock, 'wx'); }
  catch { throw new Error('別のアプリが同じ記録を保存中です。少し待って再試行してください。'); }
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (payload.baseUpdatedAt && previous?.updatedAt !== payload.baseUpdatedAt) throw new Error('記録が別の場所で更新されました。開き直してから変更してください。');
    const now = new Date(Math.max(Date.now(), (Date.parse(previous?.updatedAt) || 0) + 1)).toISOString();
    const nl = payload.fullContent.indexOf('\n');
    const record = {
      id: payload.id, contentType: payload.contentType,
      title: nl < 0 ? payload.fullContent : payload.fullContent.slice(0, nl),
      content: nl < 0 ? '' : payload.fullContent.slice(nl + 1),
      keywords: payload.keywords || null, relatedIds: payload.relatedIds || null,
      metadata: payload.metadata ?? previous?.metadata ?? {},
      sizeBytes: Buffer.byteLength(payload.fullContent, 'utf8'), isDeleted: false,
      createdAt: previous?.createdAt || now, updatedAt: now,
    };
    fs.writeFileSync(temporary, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(temporary, file);
    const { content, ...meta } = record;
    return meta;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    fs.closeSync(handle); fs.unlinkSync(lock);
  }
}
module.exports = { saveVaultRecord };
