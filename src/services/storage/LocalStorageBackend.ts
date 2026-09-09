/**
 * LocalStorageBackend.ts
 * C# LocalFS API（ThinktankLocalApi, port 8081）を呼ぶストレージバックエンド
 * window.__THINKTANK_LOCAL_API__ でベース URL を取得する
 * C# 側 API は引き続き vaultId='vault' を受け取る（互換維持のため固定渡し）
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import { splitContent } from '../../utils/thinkFormat';
import { packLocalMetadata, unpackLocalMetadata } from './localMetadata';
import { StorageConflictError } from './IStorageBackend';

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
  metadata?: Record<string, unknown>;
}

const VAULT_ID = 'vault';

function toMeta(r: CsThinkRecord): ThinkMeta {
  return {
    id:          r.id,
    contentType: r.contentType,
    title:       r.title ?? '',
    keywords:    r.keywords ?? '',
    relatedIds:  r.relatedIds ?? '',
    sizeBytes:   r.sizeBytes ?? 0,
    isDeleted:   r.isDeleted ?? false,
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
    metadata: r.metadata ?? (r.content ? unpackLocalMetadata(r.content).metadata : undefined),
  };
}

export class LocalStorageBackend implements IStorageBackend {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async listMeta(): Promise<ThinkMeta[]> {
    const res = await fetch(
      `${this.baseUrl}/api/files/meta?vaultId=${encodeURIComponent(VAULT_ID)}`
    );
    if (!res.ok) throw new Error(`listMeta failed: ${res.status}`);
    const data = (await res.json()) as CsThinkRecord[];
    // The legacy /meta endpoint omits content; fetch only Chat/HTML envelopes in bounded batches.
    const result: ThinkMeta[] = [];
    for (let i = 0; i < data.length; i += 6) {
      result.push(...await Promise.all(data.slice(i, i + 6).map(async record => {
        if (record.metadata === undefined && ['chat', 'html'].includes(record.contentType)) {
          const body = await this.getRawContent(record.id);
          if (body !== null) record.metadata = unpackLocalMetadata(body).metadata;
        }
        return toMeta(record);
      })));
    }
    return result;
  }

  async getContent(id: string): Promise<string | null> {
    const raw = await this.getRawContent(id);
    return raw === null ? null : unpackLocalMetadata(raw).body;
  }

  private async getRawContent(id: string): Promise<string | null> {
    const res = await fetch(
      `${this.baseUrl}/api/files/${encodeURIComponent(id)}/content?vaultId=${encodeURIComponent(VAULT_ID)}`
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getContent failed: ${res.status}`);
    return res.json() as Promise<string>;
  }

  async save(payload: SavePayload): Promise<ThinkMeta> {
    const { title, body } = splitContent(payload.fullContent);
    // Best effort preflight. Atomic cross-process CAS requires support in the separate C# server.
    if (payload.baseUpdatedAt && payload.metadata?.thoughtSupport) {
      const response = await fetch(`${this.baseUrl}/api/files/meta?vaultId=${encodeURIComponent(VAULT_ID)}`);
      if (!response.ok) throw new Error('保存前に最新の記録を確認できませんでした。');
      const records = await response.json() as CsThinkRecord[];
      const current = records.find(r => r.id === payload.id);
      if (!current || current.updatedAt !== payload.baseUpdatedAt) throw new StorageConflictError(payload.id, current?.updatedAt || '');
    }
    const res = await fetch(`${this.baseUrl}/api/files`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        id:          payload.id,
        vaultId:     VAULT_ID,
        contentType: payload.contentType,
        title,
        content:     packLocalMetadata(body, payload.metadata),
        keywords:    payload.keywords || null,
        relatedIds:  payload.relatedIds || null,
        metadata: payload.metadata,
        baseUpdatedAt: payload.baseUpdatedAt,
      }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const record = (await res.json()) as CsThinkRecord;
    return toMeta(record);
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/files/${encodeURIComponent(id)}?vaultId=${encodeURIComponent(VAULT_ID)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${res.status}`);
  }

  async search(query: string): Promise<ThinkMeta[]> {
    const res = await fetch(
      `${this.baseUrl}/api/files/search?vaultId=${encodeURIComponent(VAULT_ID)}&q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    const data = (await res.json()) as CsThinkRecord[];
    return data.map(toMeta);
  }
}
