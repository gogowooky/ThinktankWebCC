import { TTModels } from '../models/TTModels';
import { StorageManager } from './storage/StorageManager';
import type { ThinkMeta } from './storage/IStorageBackend';
import { StorageConflictError } from './storage/IStorageBackend';
import { ensureFullContent } from './bundleMetadataStore';
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
    if (typeof window !== 'undefined' && window.electronAPI?.storage?.getRecord) {
      const rec = await window.electronAPI.storage.getRecord(id);
      if (!rec || rec.meta.thinkid !== id || rec.meta.category !== 'bundle') {
        throw new Error('Bundleの保存情報を確認できません。');
      }
      readThinkSupport(rec.meta.metadata?.thinkSupport);
      return rec.meta;
    }

    const think = TTModels.Instance?.Vault?.GetThink(id);
    if (!think || think.ID !== id || think.ContentType !== 'bundle') {
      throw new Error('Bundleの保存情報を確認できません。');
    }
    readThinkSupport(think.Metadata?.thinkSupport);
    const nowIso = think.UpdatedAt || new Date().toISOString();
    return {
      thinkid: think.ID,
      category: think.ContentType,
      title: think.Name,
      keywords: think.Keywords || '',
      relatedIds: think.RelatedIDs || '',
      sizeBytes: think.Content.length,
      createdAt: nowIso,
      updatedAt: nowIso,
      isDeleted: false,
      metadata: think.Metadata,
    };
  }

  async save(
    id: string,
    expectedVersion: string,
    values: ThinkValues,
    sources: ThinkSources,
  ): Promise<ThinkMeta> {
    if (
      typeof window !== 'undefined' &&
      window.electronAPI?.storage?.getRecord &&
      window.electronAPI?.storage?.saveSupport
    ) {
      const current = await window.electronAPI.storage.getRecord(id);
      const prevRecord = readThinkSupport(current?.meta?.metadata?.thinkSupport);
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

      try {
        await window.electronAPI.storage.saveSupport(
          id,
          { thinkSupport },
          expectedVersion || undefined,
        );
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err.code === 'VERSION_CONFLICT' || err.message?.includes('競合')) {
          throw new StorageConflictError(id, '');
        }
        throw e;
      }
      const latest = await window.electronAPI.storage.getRecord(id);
      if (!latest) throw new Error('保存結果の対象が一致しません。');
      readThinkSupport(latest.meta.metadata?.thinkSupport);
      return latest.meta;
    }

    const think = TTModels.Instance?.Vault?.GetThink(id);
    if (!think || think.ID !== id || think.ContentType !== 'bundle') {
      throw new Error('Bundleの保存情報を確認できません。');
    }
    const prevRecord = readThinkSupport(think.Metadata?.thinkSupport);
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

    await ensureFullContent(think);
    const nextMetadata: Record<string, unknown> = {
      ...(think.Metadata ?? {}),
      thinkSupport,
    };
    think.Metadata = nextMetadata;
    const savedMeta = await StorageManager.instance.save({
      thinkid: think.ID,
      category: think.ContentType,
      fullContent: think.Content,
      keywords: think.Keywords,
      relatedIds: think.RelatedIDs,
      metadata: nextMetadata,
      baseUpdatedAt: expectedVersion || think.UpdatedAt || undefined,
    });
    think.UpdatedAt = savedMeta.updatedAt;
    think.markSaved();
    think.markMetadataSaved();
    TTModels.Instance?.Vault?.NotifyUpdated(false);
    readThinkSupport(savedMeta.metadata?.thinkSupport);
    return savedMeta;
  }
}
