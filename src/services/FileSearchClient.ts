import { apiFetch } from './apiClient';
import { object } from '../../server/services/conversationRecord';
import { parseFileSearchStatus, parseFileSearchPage } from '../../server/services/fileSearchRecord';
async function body(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error : '接続先を確認できません。');
  return value;
}
export class FileSearchClient {
  async status(signal?: AbortSignal) { return parseFileSearchStatus(await body(await apiFetch('/api/think-support/file-search/status', { signal }))); }
  async listStores(connectionId: string, pageToken = '', signal?: AbortSignal) {
    const query = new URLSearchParams({ connectionId }); if (pageToken) query.set('pageToken', pageToken);
    return parseFileSearchPage(await body(await apiFetch(`/api/think-support/file-search/stores?${query}`, { signal })), connectionId);
  }
}
