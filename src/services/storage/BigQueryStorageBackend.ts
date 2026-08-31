/**
 * BigQueryStorageBackend.ts
 * Express BigQuery API（/api/bq/...）を呼ぶストレージバックエンド
 * Vite proxy により /api/* → http://localhost:8080 に転送される
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import { StorageConflictError } from './IStorageBackend';
import { splitContent } from '../../utils/thinkFormat';
import { apiFetch } from '../apiClient';

export class BigQueryStorageBackend implements IStorageBackend {
  private readonly base = '/api/bq';

  async listMeta(): Promise<ThinkMeta[]> {
    const res = await apiFetch(`${this.base}/files/meta`);
    if (!res.ok) throw new Error(`BQ listMeta failed: ${res.status}`);
    return res.json() as Promise<ThinkMeta[]>;
  }

  async getContent(id: string): Promise<string | null> {
    const res = await apiFetch(`${this.base}/files/${encodeURIComponent(id)}/content`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`BQ getContent failed: ${res.status}`);
    return res.json() as Promise<string>;
  }

  async save(payload: SavePayload): Promise<ThinkMeta> {
    const { title, body } = splitContent(payload.fullContent);
    const res = await apiFetch(`${this.base}/files`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id:          payload.id,
        contentType: payload.contentType,
        title,
        content:     body,
        keywords:    payload.keywords || null,
        relatedIds:  payload.relatedIds || null,
        metadata:    payload.metadata || null,
        baseUpdatedAt: payload.baseUpdatedAt || undefined,
      }),
    });
    if (res.status === 409) {
      const j = await res.json().catch(() => ({})) as { serverUpdatedAt?: string };
      throw new StorageConflictError(payload.id, j.serverUpdatedAt ?? '');
    }
    if (!res.ok) throw new Error(`BQ save failed: ${res.status}`);
    return res.json() as Promise<ThinkMeta>;
  }

  async delete(id: string): Promise<void> {
    const res = await apiFetch(
      `${this.base}/files/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) throw new Error(`BQ delete failed: ${res.status}`);
  }

  async search(query: string): Promise<ThinkMeta[]> {
    const res = await apiFetch(
      `${this.base}/files/search?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`BQ search failed: ${res.status}`);
    return res.json() as Promise<ThinkMeta[]>;
  }
}
