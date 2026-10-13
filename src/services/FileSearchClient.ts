import { apiFetch, readApiJson } from './apiClient';
import { object } from '../../server/contracts/conversationRecord';
import { parseFileSearchStatus, parseFileSearchPage } from '../../server/contracts/fileSearchRecord';
import { readBindingLog, type BindingInput, type BindingState } from '../../server/contracts/fileSearchBindingRecord';
export class FileSearchClient {
  private parseBinding(value: unknown, bundleId: string): BindingState {
    if (!object(value) || value.bundleId !== bundleId || typeof value.version !== 'string' || !Number.isFinite(Date.parse(value.version)) || !object(value.log)) throw new Error('ストア対応の対象または版が不正です。');
    return { bundleId, version: value.version, log: readBindingLog(value.log) };
  }
  async readBinding(bundleId: string): Promise<BindingState> {
    return this.parseBinding(await readApiJson(await apiFetch(`/api/think-support/file-search/bundles/${encodeURIComponent(bundleId)}/binding`), '接続先を確認できません。'), bundleId);
  }
  async saveBinding(bundleId: string, version: string, operationId: string, input: BindingInput): Promise<BindingState> {
    return this.parseBinding(await readApiJson(await apiFetch(`/api/think-support/file-search/bundles/${encodeURIComponent(bundleId)}/binding`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: version, operationId, input, confirmed: true }),
    }), '接続先を確認できません。'), bundleId);
  }
  async status(signal?: AbortSignal) { return parseFileSearchStatus(await readApiJson(await apiFetch('/api/think-support/file-search/status', { signal }), '接続先を確認できません。')); }
  async listStores(connectionId: string, pageToken = '', signal?: AbortSignal) {
    const query = new URLSearchParams({ connectionId }); if (pageToken) query.set('pageToken', pageToken);
    return parseFileSearchPage(await readApiJson(await apiFetch(`/api/think-support/file-search/stores?${query}`, { signal }), '接続先を確認できません。'), connectionId);
  }
}
