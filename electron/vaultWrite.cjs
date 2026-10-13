'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseFrontmatter, serialize } = require('./mdFormat.cjs');

class VaultLockedError extends Error {
  constructor() {
    super('別のアプリが同じ記録を保存中です。少し待って再試行してください。');
    this.code = 'VAULT_LOCKED';
  }
}

function vaultRecordPath(directory, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new Error('不正なThink IDです。');
  return path.join(directory, `${id}.md`);
}

function readRecord(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return { exists: false, raw: null, meta: null, body: null };
    throw error;
  }
  return { exists: true, raw, ...parseFrontmatter(raw) };
}

function recordSnapshot(record) {
  const updatedAt = record.meta?.updated_at;
  return {
    exists: record.exists,
    version: updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt == null ? null : String(updatedAt),
    // 外部のエディタがupdated_atを保ったまま本文を書き換える場合も保護する。
    hash: record.exists ? crypto.createHash('sha256').update(record.raw, 'utf8').digest('hex') : null,
  };
}

function readVaultSnapshot(directory, id) {
  return recordSnapshot(readRecord(vaultRecordPath(directory, id)));
}

function matchesSnapshot(record, expected) {
  const current = recordSnapshot(record);
  return current.exists === expected.exists && current.version === expected.version && current.hash === expected.hash;
}

function nextVaultVersion(meta) {
  return new Date(Math.max(Date.now(), (Date.parse(meta?.updated_at) || 0) + 1)).toISOString();
}

// 全書込口が同じlockを使うことで、別アプリの保存・削除・同期とも直列化する。
function updateVaultRecord(directory, id, change) {
  const file = vaultRecordPath(directory, id);
  fs.mkdirSync(directory, { recursive: true });
  const lock = `${file}.lock`;
  let handle;
  try { handle = fs.openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new VaultLockedError();
    throw error;
  }
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const decision = change(readRecord(file));
    if (decision.text !== undefined) {
      fs.writeFileSync(temporary, decision.text, 'utf8');
      fs.renameSync(temporary, file);
    }
    return decision.result;
  } finally {
    // tempの後始末が失敗しても、lockの解放は必ず試みる。
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    finally {
      try { fs.closeSync(handle); }
      finally { fs.unlinkSync(lock); }
    }
  }
}

function deleteVaultRecord(directory, id) {
  return updateVaultRecord(directory, id, current => {
    if (!current.exists) return { result: { status: 'missing' } };
    if (current.meta.is_deleted) return { result: { status: 'unchanged' } };
    const meta = { ...current.meta, is_deleted: true, updated_at: nextVaultVersion(current.meta) };
    return { text: serialize(meta, current.body), result: { status: 'deleted' } };
  });
}

module.exports = { updateVaultRecord, deleteVaultRecord, readVaultSnapshot, matchesSnapshot, nextVaultVersion, VaultLockedError };
