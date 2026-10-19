import { TTModels } from '../models/TTModels';
import type { TTThink } from '../models/TTThink';
import { StorageManager } from './storage/StorageManager';
import { StorageConflictError } from './storage/IStorageBackend';

export interface BundleMetadata {
  metadata: Record<string, unknown>;
  /** 楽観ロックに使う版。保存先の updatedAt */
  version: string;
}

function isVersionConflict(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === 'VERSION_CONFLICT' || !!err?.message?.includes('競合');
}

/**
 * ブラウザ版で Think 全体を保存し直す前に本文を揃える。一覧だけ読んだ段階（IsMetaOnly）では
 * 本文がタイトル行しかなく、そのまま保存すると本文を失うため。
 */
export async function ensureFullContent(think: TTThink): Promise<void> {
  if (think.IsMetaOnly) await think.LoadContent();
  if (think.IsMetaOnly) throw new Error('本文を読み込めないため保存できません。再読み込みしてください。');
}

/** Bundle のメタデータを Firestore 正本から読む。 */
export async function readBundleMetadata(bundleId: string): Promise<BundleMetadata> {
  const record = await StorageManager.instance.getRecord(bundleId);
  if (!record) throw new Error('対象のBundleが見つかりません。');
  return { metadata: record.meta.metadata ?? {}, version: record.meta.updatedAt };
}

/**
 * patch をメタデータへ浅くマージして保存し、保存後のメタデータと版を返す。
 * expectedVersion が保存先の版と食い違えば StorageConflictError。
 */
export async function saveBundleMetadata(
  bundleId: string,
  expectedVersion: string,
  patch: Record<string, unknown>,
): Promise<BundleMetadata> {
  const vault = TTModels.Instance?.Vault;
  const think = vault?.GetThink(bundleId);
  let savedMeta;
  try {
    savedMeta = await StorageManager.instance.updateMetadata(
      bundleId,
      patch,
      expectedVersion || undefined,
    );
  } catch (e) {
    if (isVersionConflict(e)) throw new StorageConflictError(bundleId, '');
    throw e;
  }
  const nextMetadata = savedMeta.metadata ?? {};
  if (think) {
    think.Metadata = nextMetadata;
    think.UpdatedAt = savedMeta.updatedAt;
    think.markSaved();
    think.markMetadataSaved();
  }
  vault?.NotifyUpdated(false);
  return { metadata: nextMetadata, version: savedMeta.updatedAt };
}
