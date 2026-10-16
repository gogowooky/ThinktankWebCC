import { apiFetch, readApiJson } from './apiClient';
import type { ThinkMeta } from './storage/IStorageBackend';
import { StorageConflictError } from './storage/IStorageBackend';
import {
  readThinkSupport,
  type ThinkValues,
  type ThinkSources,
  type ThinkSupportRecord,
} from '../../server/contracts/thinkSupportRecord';
export { THINK_FIELDS, emptyThinkValues, readThinkSupport } from '../../server/contracts/thinkSupportRecord';
export type { ThinkField, ThinkValues, ThinkSources, ThinkSupportRecord } from '../../server/contracts/thinkSupportRecord';

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

    const response = await apiFetch(`/api/bq/files/${encodeURIComponent(id)}/think-support`);
    const meta = (await readApiJson(
      response,
      '保存済みの思考状態を取得できませんでした。',
      { useServerError: false },
    )) as ThinkMeta;
    if (meta.thinkid !== id || meta.category !== 'bundle' || !meta.updatedAt) {
      throw new Error('Bundleの保存情報を確認できません。');
    }
    readThinkSupport(meta.metadata?.thinkSupport);
    return meta;
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

    const response = await apiFetch(`/api/bq/files/${encodeURIComponent(id)}/think-support`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, values, sources, confirmed: true }),
    });
    if (response.status === 409) throw new StorageConflictError(id, '');
    const meta = (await readApiJson(
      response,
      '保存を確認できませんでした。入力は保持しています。最新の保存内容を確認してください。',
      { useServerError: false },
    )) as ThinkMeta;
    if (meta.thinkid !== id) throw new Error('保存結果の対象が一致しません。');
    readThinkSupport(meta.metadata?.thinkSupport);
    return meta;
  }
}
