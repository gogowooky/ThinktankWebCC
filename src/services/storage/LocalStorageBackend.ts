/**
 * LocalStorageBackend.ts
 * C# LocalFS API（ThinktankLocalApi, port 8081）を呼ぶストレージバックエンド
 * window.__THINKTANK_LOCAL_API__ でベース URL を取得する
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';

/** C# API が返す camelCase レスポンス */
interface CsThinkRecord {
  id:          string;
  vaultId:     string;
  contentType: string;
  title:       string;
  content:     string | null;
  keywords:    string | null;
  relatedIds:  string | null;
  sizeBytes:   number;
  isDeleted:   boolean;
  createdAt:   string;
  updatedAt:   string;
}

function toMeta(r: CsThinkRecord): ThinkMeta {
  return {
    id:          r.id,
    vaultId:     r.vaultId,
    contentType: r.contentType,
    title:       r.title ?? '',
    keywords:    r.keywords ?? '',
    relatedIds:  r.relatedIds ?? '',
    sizeBytes:   r.sizeBytes ?? 0,
    isDeleted:   r.isDeleted ?? false,
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  };
}

function splitContent(fullContent: string): { title: string; body: string } {
  const nl = fullContent.indexOf('\n');
  if (nl === -1) return { title: fullContent, body: '' };
  return { title: fullContent.slice(0, nl), body: fullContent.slice(nl + 1) };
}

export class LocalStorageBackend implements IStorageBackend {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    // 末尾スラッシュを除去
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async listMeta(vaultId: string): Promise<ThinkMeta[]> {
    const res = await fetch(`${this.baseUrl}/api/files/meta?vaultId=${encodeURIComponent(vaultId)}`);
    if (!res.ok) throw new Error(`listMeta failed: ${res.status}`);
    const data = (await res.json()) as CsThinkRecord[];
    return data.map(toMeta);
  }

  async getContent(vaultId: string, id: string): Promise<string | null> {
    const res = await fetch(
      `${this.baseUrl}/api/files/${encodeURIComponent(id)}/content?vaultId=${encodeURIComponent(vaultId)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getContent failed: ${res.status}`);
    return res.json() as Promise<string>;
  }

  async save(payload: SavePayload): Promise<ThinkMeta> {
    const { title, body } = splitContent(payload.fullContent);
    const body_ = {
      id:          payload.id,
      vaultId:     payload.vaultId,
      contentType: payload.contentType,
      title,
      content:     body,
      keywords:    payload.keywords || null,
      relatedIds:  payload.relatedIds || null,
    };
    const res = await fetch(`${this.baseUrl}/api/files`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body_),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const record = (await res.json()) as CsThinkRecord;
    return toMeta(record);
  }

  async delete(vaultId: string, id: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/files/${encodeURIComponent(id)}?vaultId=${encodeURIComponent(vaultId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
  }

  async search(vaultId: string, query: string): Promise<ThinkMeta[]> {
    const res = await fetch(
      `${this.baseUrl}/api/files/search?vaultId=${encodeURIComponent(vaultId)}&q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    const data = (await res.json()) as CsThinkRecord[];
    return data.map(toMeta);
  }
}
