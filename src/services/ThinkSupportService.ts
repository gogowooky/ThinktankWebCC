import { apiFetch } from './apiClient';
import type { ThinkMeta } from './storage/IStorageBackend';
import { StorageConflictError } from './storage/IStorageBackend';
import { readThinkSupport, type ThinkValues, type ThinkSources } from '../../server/services/thinkSupportRecord';
export { THINK_FIELDS, emptyThinkValues, readThinkSupport } from '../../server/services/thinkSupportRecord';
export type { ThinkField, ThinkValues, ThinkSources, ThinkSupportRecord } from '../../server/services/thinkSupportRecord';

export class ThinkSupportService {
  async read(id: string): Promise<ThinkMeta> {
    const response = await apiFetch(`/api/bq/files/${encodeURIComponent(id)}/think-support`);
    if (!response.ok) throw new Error('保存済みの思考状態を取得できませんでした。');
    const meta: ThinkMeta = await response.json();
    if (meta.id !== id || meta.contentType !== 'bundle' || !meta.updatedAt) throw new Error('Bundleの保存情報を確認できません。');
    readThinkSupport(meta.metadata?.thinkSupport);
    return meta;
  }
  async save(id: string, expectedVersion: string, values: ThinkValues, sources: ThinkSources): Promise<ThinkMeta> {
    const response = await apiFetch(`/api/bq/files/${encodeURIComponent(id)}/think-support`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion, values, sources, confirmed: true }),
    });
    if (response.status === 409) throw new StorageConflictError(id, '');
    if (!response.ok) throw new Error('保存を確認できませんでした。入力は保持しています。最新の保存内容を確認してください。');
    const meta: ThinkMeta = await response.json();
    if (meta.id !== id) throw new Error('保存結果の対象が一致しません。');
    readThinkSupport(meta.metadata?.thinkSupport);
    return meta;
  }
}
