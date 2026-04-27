/**
 * BigQueryStorageBackend.ts
 * Express BigQuery API（/api/bq/...）を呼ぶストレージバックエンド
 * Vite proxy により /api/* → http://localhost:8080 に転送される
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';

function splitContent(fullContent: string): { title: string; body: string } {
  const nl = fullContent.indexOf('\n');
  if (nl === -1) return { title: fullContent, body: '' };
  return { title: fullContent.slice(0, nl), body: fullContent.slice(nl + 1) };
}

export class BigQueryStorageBackend implements IStorageBackend {
  private readonly base = '/api/bq';

  async listMeta(vaultId: string): Promise<ThinkMeta[]> {
    const res = await fetch(`${this.base}/files/meta?vaultId=${encodeURIComponent(vaultId)}`);
    if (!res.ok) throw new Error(`BQ listMeta failed: ${res.status}`);
    return res.json() as Promise<ThinkMeta[]>;
  }

  async getContent(vaultId: string, id: string): Promise<string | null> {
    const res = await fetch(
      `${this.base}/files/${encodeURIComponent(id)}/content?vaultId=${encodeURIComponent(vaultId)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`BQ getContent failed: ${res.status}`);
    return res.json() as Promise<string>;
  }

  async save(payload: SavePayload): Promise<ThinkMeta> {
    const { title, body } = splitContent(payload.fullContent);
    const res = await fetch(`${this.base}/files`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id:          payload.id,
        vaultId:     payload.vaultId,
        contentType: payload.contentType,
        title,
        content:     body,
        keywords:    payload.keywords || null,
        relatedIds:  payload.relatedIds || null,
      }),
    });
    if (!res.ok) throw new Error(`BQ save failed: ${res.status}`);
    return res.json() as Promise<ThinkMeta>;
  }

  async delete(vaultId: string, id: string): Promise<void> {
    const res = await fetch(
      `${this.base}/files/${encodeURIComponent(id)}?vaultId=${encodeURIComponent(vaultId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) throw new Error(`BQ delete failed: ${res.status}`);
  }

  async search(vaultId: string, query: string): Promise<ThinkMeta[]> {
    const res = await fetch(
      `${this.base}/files/search?vaultId=${encodeURIComponent(vaultId)}&q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`BQ search failed: ${res.status}`);
    return res.json() as Promise<ThinkMeta[]>;
  }
}
