import { TTModels } from '../models/TTModels';
import { StorageManager } from './storage/StorageManager';
import type { ThinkMeta } from './storage/IStorageBackend';
import { StorageConflictError } from './storage/IStorageBackend';
import {
  readThinkSupport,
  type ThinkValues,
  type ThinkSources,
  type ThinkSupportRecord,
} from '../../shared/contracts/thinkSupportRecord';
export { THINK_FIELDS, emptyThinkValues, readThinkSupport } from '../../shared/contracts/thinkSupportRecord';
export type { ThinkField, ThinkValues, ThinkSources, ThinkSupportRecord } from '../../shared/contracts/thinkSupportRecord';

export class ThinkSupportService {
  async read(id: string): Promise<ThinkMeta> {
    const record = await StorageManager.instance.getRecord(id);
    if (!record || record.meta.thinkid !== id || record.meta.category !== 'bundle') {
      throw new Error('Bundleの保存情報を確認できません。');
    }
    readThinkSupport(record.meta.metadata?.thinkSupport);
    return record.meta;
  }

  async save(
    id: string,
    expectedVersion: string,
    values: ThinkValues,
    sources: ThinkSources,
  ): Promise<ThinkMeta> {
    const current = await StorageManager.instance.getRecord(id);
    if (!current || current.meta.category !== 'bundle') {
      throw new Error('Bundleの保存情報を確認できません。');
    }
    const think = TTModels.Instance?.Vault?.GetThink(id);
    const prevRecord = readThinkSupport(current.meta.metadata?.thinkSupport);
    const nowIso = new Date().toISOString();
    const thinkSupport: ThinkSupportRecord = {
      schemaVersion: 1,
      revision: (prevRecord?.revision ?? 0) + 1,
      values,
      sources,
      author: 'human',
      confirmedAt: nowIso,
      updatedAt: nowIso,
    };
    readThinkSupport(thinkSupport);

    let savedMeta: ThinkMeta;
    try {
      savedMeta = await StorageManager.instance.updateMetadata(
        id,
        { thinkSupport },
        expectedVersion || current.meta.updatedAt || undefined,
      );
    } catch (e) {
      if (e instanceof StorageConflictError) throw e;
      const err = e as { code?: string; message?: string };
      if (err.code === 'VERSION_CONFLICT' || err.message?.includes('競合')) {
        throw new StorageConflictError(id, '');
      }
      throw e;
    }
    const nextMetadata = savedMeta.metadata ?? {};
    if (think) {
      think.Metadata = nextMetadata;
      think.UpdatedAt = savedMeta.updatedAt;
      think.markSaved();
      think.markMetadataSaved();
    }
    TTModels.Instance?.Vault?.NotifyUpdated(false);
    readThinkSupport(savedMeta.metadata?.thinkSupport);
    return savedMeta;
  }
}
