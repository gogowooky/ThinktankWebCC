/**
 * BigQueryStorageBackend.ts
 * Express BigQuery API（/api/bq/...）を呼ぶストレージバックエンド
 * Vite proxy により /api/* → http://localhost:8080 に転送される
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import { StorageConflictError, StorageTimeoutError } from './IStorageBackend';
import { splitContent } from '../../utils/thinkFormat';
import { apiFetch } from '../apiClient';

// 応答のない保存が残ると、TTThink が直列化している同じ Think の後続保存が永久に待たされる
export const SAVE_TIMEOUT_MS = 30_000;

export class BigQueryStorageBackend implements IStorageBackend {
  private readonly base = '/api/bq';

  async listMeta(): Promise<ThinkMeta[]> {
    const res = await apiFetch(`${this.base}/files/meta`);
    if (!res.ok) throw new Error(`BQ listMeta failed: ${res.status}`);
    return res.json() as Promise<ThinkMeta[]>;
  }

  // API パス /files/:id/content はサーバーの content 列＝本文のみを返す（タイトル行は title 列）
  async getBody(id: string): Promise<string | null> {
    const res = await apiFetch(`${this.base}/files/${encodeURIComponent(id)}/content`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`BQ getBody failed: ${res.status}`);
    return res.json() as Promise<string>;
  }

  async save(payload: SavePayload): Promise<ThinkMeta> {
    const { title, body } = splitContent(payload.fullContent);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
    try {
      const res = await apiFetch(`${this.base}/files`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          thinkid:     payload.thinkid,
          category:    payload.category,
          title,
          content:     body,
          keywords:    payload.keywords || null,
          relatedIds:  payload.relatedIds || null,
          metadata:    payload.metadata || null,
          baseUpdatedAt: payload.baseUpdatedAt || undefined,
        }),
        signal: controller.signal,
      });
      if (res.status === 409) {
        const j = await res.json().catch(() => ({})) as { serverUpdatedAt?: string };
        throw new StorageConflictError(payload.thinkid, j.serverUpdatedAt ?? '');
      }
      if (!res.ok) throw new Error(`BQ save failed: ${res.status}`);
      return await res.json() as ThinkMeta;
    } catch (e) {
      if (controller.signal.aborted) throw new StorageTimeoutError(payload.thinkid);
      throw e;
    } finally {
      clearTimeout(timer);
    }
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
