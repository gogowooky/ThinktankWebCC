import { apiFetch } from './apiClient';
import { object } from '../../server/services/conversationRecord';
import { parseFileSearchStatus, parseFileSearchPage } from '../../server/services/fileSearchRecord';
import { readBindingLog, type BindingInput, type BindingState } from '../../server/services/fileSearchBindingRecord';
async function body(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error : '接続先を確認できません。');
  return value;
}
export class FileSearchClient {
  private parseBinding(value: unknown, bundleId: string): BindingState {
    if (!object(value) || value.bundleId !== bundleId || typeof value.version !== 'string' || !Number.isFinite(Date.parse(value.version)) || !object(value.log)) throw new Error('ストア対応の対象または版が不正です。');
    return { bundleId, version: value.version, log: readBindingLog(value.log) };
  }
  async readBinding(bundleId: string): Promise<BindingState> {
    return this.parseBinding(await body(await apiFetch(`/api/think-support/file-search/bundles/${encodeURIComponent(bundleId)}/binding`)), bundleId);
  }
  async saveBinding(bundleId: string, version: string, operationId: string, input: BindingInput): Promise<BindingState> {
    return this.parseBinding(await body(await apiFetch(`/api/think-support/file-search/bundles/${encodeURIComponent(bundleId)}/binding`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: version, operationId, input, confirmed: true }),
    })), bundleId);
  }
  async status(signal?: AbortSignal) { return parseFileSearchStatus(await body(await apiFetch('/api/think-support/file-search/status', { signal }))); }
  async listStores(connectionId: string, pageToken = '', signal?: AbortSignal) {
    const query = new URLSearchParams({ connectionId }); if (pageToken) query.set('pageToken', pageToken);
    return parseFileSearchPage(await body(await apiFetch(`/api/think-support/file-search/stores?${query}`, { signal })), connectionId);
  }
}
