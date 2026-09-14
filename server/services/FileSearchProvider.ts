import { id, object } from './conversationRecord.js';
import { parseFileSearchPage, validPageToken, type FileSearchPage, type FileSearchStatus } from './fileSearchRecord.js';

export class FileSearchError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export interface FileSearchProvider {
  status(): FileSearchStatus;
  listStores(connectionId: string, pageToken?: string, signal?: AbortSignal): Promise<FileSearchPage>;
}
export class DisabledFileSearchProvider implements FileSearchProvider {
  status(): FileSearchStatus { return { provider: 'gemini-file-search', enabled: false, connectionId: null, mode: 'read-only' }; }
  async listStores(): Promise<never> { throw new FileSearchError(503, 'Gemini File Searchは停止中です。'); }
}
export class GeminiFileSearchProvider implements FileSearchProvider {
  constructor(private readonly connectionId: string, private readonly key: string, private readonly request: typeof fetch = fetch) {}
  status(): FileSearchStatus { return { provider: 'gemini-file-search', enabled: true, connectionId: this.connectionId, mode: 'read-only' }; }
  async listStores(connectionId: string, pageToken = '', signal?: AbortSignal): Promise<FileSearchPage> {
    if (connectionId !== this.connectionId) throw new FileSearchError(409, '接続設定が変わっています。設定を再取得してください。');
    if (!validPageToken(pageToken)) throw new FileSearchError(400, 'ページ指定が不正です。');
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/fileSearchStores');
    url.searchParams.set('pageSize', '20'); if (pageToken) url.searchParams.set('pageToken', pageToken);
    const controller = new AbortController(); const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 15000);
    try {
      const response = await this.request(url.toString(), { method: 'GET', headers: { 'x-goog-api-key': this.key }, redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new FileSearchError(response.status === 429 ? 429 : 502, response.status === 429 ? 'File Searchの利用制限に達しました。時間を置いて再試行してください。' : 'File Searchに接続できません。サーバー側の認証と権限を確認してください。');
      const raw: unknown = await response.json();
      if (!object(raw) || 'error' in raw || (raw.fileSearchStores !== undefined && !Array.isArray(raw.fileSearchStores))) throw new Error('Invalid response');
      const stores = (raw.fileSearchStores ?? []) as unknown[];
      const page = parseFileSearchPage({ connectionId, checkedAt: new Date().toISOString(),
        stores: stores.map(s => {
          if (!object(s)) throw new Error('Invalid store');
          return { name: s.name, displayName: s.displayName ?? '', activeDocuments: s.activeDocumentsCount ?? null,
            pendingDocuments: s.pendingDocumentsCount ?? null, failedDocuments: s.failedDocumentsCount ?? null };
        }), nextPageToken: raw.nextPageToken === undefined || raw.nextPageToken === '' ? null : raw.nextPageToken,
      }, connectionId);
      if (pageToken && page.nextPageToken === pageToken) throw new Error('Repeated page token');
      return page;
    } catch (e) {
      if (e instanceof FileSearchError) throw e;
      // Provider error bodies and network exception messages may contain credentials or request details.
      throw new FileSearchError(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'File Searchの接続確認を中断しました。または時間切れです。' : 'File Searchから有効な応答を取得できませんでした。');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}
export function configuredFileSearchProvider(env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): FileSearchProvider {
  const connectionId = env.THINK_SUPPORT_FILE_SEARCH_CONNECTION_ID?.trim();
  const key = env.THINK_SUPPORT_FILE_SEARCH_API_KEY?.trim();
  if (env.THINK_SUPPORT_FILE_SEARCH_ENABLED !== 'true' || !id(connectionId) || !key) return new DisabledFileSearchProvider();
  return new GeminiFileSearchProvider(connectionId, key, request);
}
