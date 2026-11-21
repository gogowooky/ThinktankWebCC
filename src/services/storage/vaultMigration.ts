/**
 * vaultMigration.ts
 * Firestore と ThinkファイルFolder（ローカル運用の正本）の間で Think を写す。
 * 同じ thinkid は updatedAt の新しい方を残し、上書きされる版は ThinkファイルFolder の trash/ に退避する。
 * Firestore モードで実行する（docs/261103/ローカル運用モード.md）。
 */

import type { FirestoreStorageBackend } from '../../platform/web/FirestoreStorageBackend';

export interface VaultMigrationResult {
  created: number;
  updated: number;
  skipped: number;
  failedIds: string[];
}

/** 画面の配置などを持つ管理用 Think。thinkid がモードごとに別の Think を指すので移さない。 */
const NON_MIGRATED_IDS = new Set(['__tt_ui_state__']);

function localVaultApi() {
  const api = typeof window !== 'undefined' ? window.electronAPI?.localVault : undefined;
  if (!api) throw new Error('ThinkファイルFolder への移行は PC版で実行してください。');
  return api;
}

function emptyResult(): VaultMigrationResult {
  return { created: 0, updated: 0, skipped: 0, failedIds: [] };
}

export async function copyFirestoreToLocal(
  firestore: FirestoreStorageBackend,
  localVaultDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<VaultMigrationResult> {
  const api = localVaultApi();
  const records = (await firestore.listRecordsForMigration()).filter(
    (record) => !NON_MIGRATED_IDS.has(record.meta.thinkid) && !record.meta.isDeleted,
  );
  const result = emptyResult();
  for (const [index, record] of records.entries()) {
    const { meta, body } = record;
    try {
      const outcome = await api.importNewer(localVaultDir, {
        thinkid: meta.thinkid,
        category: meta.category,
        fullContent: body ? `${meta.title}\n${body}` : meta.title,
        keywords: meta.keywords,
        relatedIds: meta.relatedIds,
        metadata: meta.metadata,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      });
      result[outcome.status] += 1;
    } catch (error) {
      result.failedIds.push(meta.thinkid);
      console.warn(`[vaultMigration] ThinkファイルFolder へ写せませんでした (${meta.thinkid})`, error);
    }
    onProgress?.(index + 1, records.length);
  }
  return result;
}

export async function copyLocalToFirestore(
  firestore: FirestoreStorageBackend,
  localVaultDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<VaultMigrationResult> {
  const api = localVaultApi();
  const metas = (await api.listMeta(localVaultDir)).filter(
    (meta) => !NON_MIGRATED_IDS.has(meta.thinkid) && !meta.isDeleted,
  );
  const result = emptyResult();
  for (const [index, listed] of metas.entries()) {
    try {
      const record = await api.getRecord(localVaultDir, listed.thinkid);
      if (!record) {
        result.skipped += 1;
      } else {
        const outcome = await firestore.importNewerRecord(
          { meta: record.meta, body: record.body },
          async (replaced) => { await api.stashVersion(localVaultDir, replaced, 'firestore-overwritten'); },
        );
        result[outcome] += 1;
      }
    } catch (error) {
      result.failedIds.push(listed.thinkid);
      console.warn(`[vaultMigration] Firestore へ写せませんでした (${listed.thinkid})`, error);
    }
    onProgress?.(index + 1, metas.length);
  }
  return result;
}

/**
 * 上書き用Thinkファイルフォルダーの .md を、更新日時に関わらず Firestore へ上書きする。
 * フォルダには書き込まない。上書きされる Firestore の版は Markdownバックアップ先の trash/ に退避する。
 */
export async function overwriteFolderToFirestore(
  firestore: FirestoreStorageBackend,
  sourceDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<VaultMigrationResult> {
  const api = typeof window !== 'undefined' ? window.electronAPI?.overwriteImport : undefined;
  if (!api) throw new Error('上書きコピーは PC版で実行してください。');
  const ids = (await api.listIds(sourceDir)).filter((id) => !NON_MIGRATED_IDS.has(id));
  const result = emptyResult();
  for (const [index, id] of ids.entries()) {
    try {
      const record = await api.getRecord(sourceDir, id);
      if (!record) {
        result.skipped += 1;
      } else {
        const outcome = await firestore.overwriteRecord(
          { meta: record.meta, body: record.body },
          async (replaced) => { await api.stashFirestoreVersion(replaced); },
        );
        result[outcome] += 1;
      }
    } catch (error) {
      result.failedIds.push(id);
      console.warn(`[vaultMigration] Firestore へ上書きできませんでした (${id})`, error);
    }
    onProgress?.(index + 1, ids.length);
  }
  return result;
}
