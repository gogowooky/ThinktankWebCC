'use strict';
const { serialize } = require('./mdFormat.cjs');
const { updateVaultRecord, readVaultSnapshot, matchesSnapshot, VaultLockedError } = require('./vaultWrite.cjs');

function frontmatterFromServer(meta) {
  return {
    ...(meta.metadata && typeof meta.metadata === 'object' ? meta.metadata : {}),
    thinkid: meta.thinkid,
    category: meta.category,
    title: meta.title || '',
    keywords: meta.keywords || null,
    related_ids: meta.relatedIds || null,
    size_bytes: meta.sizeBytes ?? 0,
    is_deleted: meta.isDeleted ?? false,
    created_at: meta.createdAt,
    updated_at: meta.updatedAt,
  };
}

function commitSyncedRecord(directory, meta, content, expected) {
  try {
    return updateVaultRecord(directory, meta.thinkid, current => {
      if (!matchesSnapshot(current, expected)) return { result: { status: 'conflict' } };
      return { text: serialize(frontmatterFromServer(meta), content || ''), result: { status: 'written' } };
    });
  } catch (error) {
    if (error instanceof VaultLockedError) return { status: 'conflict' };
    throw error;
  }
}

async function syncVaultFromServer(directory, serverMetas, fetchContent) {
  let skipped = 0;
  const planned = [];
  for (const meta of serverMetas) {
    const expected = readVaultSnapshot(directory, meta.thinkid);
    const serverVersion = Date.parse(meta.updatedAt);
    if (!Number.isFinite(serverVersion)) throw new Error('同期元の保存版を確認できません。');
    if (expected.exists && (!Number.isFinite(Date.parse(expected.version)) || Date.parse(expected.version) >= serverVersion)) {
      skipped++;
    } else {
      planned.push({ meta, expected });
    }
  }

  // 本文取得中はlockを持たず、取得待ちの間も通常の保存・削除を妨げない。
  const fetched = await Promise.all(planned.map(async item => ({ ...item, content: await fetchContent(item.meta) })));
  let added = 0, updated = 0;
  for (const { meta, expected, content } of fetched) {
    const result = commitSyncedRecord(directory, meta, content, expected);
    if (result.status === 'conflict') skipped++;
    else if (expected.exists) updated++;
    else added++;
  }
  return { added, updated, skipped, total: serverMetas.length };
}

module.exports = { syncVaultFromServer, commitSyncedRecord };
