// ストレージバックエンド切り替えシングルトン（仕様書05 §1）

import type { AppMode, IStorageBackend, SavePayload, ThinkMeta } from '../types';

const API_BASE = '/api/bq';

class HttpStorageBackend implements IStorageBackend {
  async listMeta(): Promise<ThinkMeta[]> {
    const res = await fetch(`${API_BASE}/files/meta`);
    if (!res.ok) throw new Error(`listMeta failed: ${res.status}`);
    return res.json();
  }

  async getContent(id: string): Promise<string | null> {
    const res = await fetch(`${API_BASE}/files/${encodeURIComponent(id)}/content`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getContent failed: ${res.status}`);
    const data = await res.json();
    return data.content ?? null;
  }

  async save(payload: SavePayload): Promise<ThinkMeta> {
    const res = await fetch(`${API_BASE}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    return res.json();
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  }

  async search(query: string): Promise<ThinkMeta[]> {
    const res = await fetch(`${API_BASE}/files/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return res.json();
  }
}

class ElectronStorageBackend implements IStorageBackend {
  private get api() {
    return window.electronAPI!;
  }
  listMeta() { return this.api.listMeta(); }
  getContent(id: string) { return this.api.getContent(id); }
  save(payload: SavePayload) { return this.api.save(payload); }
  delete(id: string) { return this.api.delete(id); }
  search(query: string) { return this.api.search(query); }
}

export class StorageManager {
  private static _instance: StorageManager | null = null;
  readonly backend: IStorageBackend;
  readonly mode: AppMode;

  private constructor() {
    if (typeof window !== 'undefined' && window.electronAPI) {
      this.backend = new ElectronStorageBackend();
      this.mode = 'local';
    } else if (typeof window !== 'undefined' && window.__THINKTANK_MODE__ === 'local') {
      this.backend = new HttpStorageBackend();
      this.mode = 'local';
    } else {
      this.backend = new HttpStorageBackend();
      this.mode = 'online';
    }
  }

  static get Instance(): StorageManager {
    if (!this._instance) this._instance = new StorageManager();
    return this._instance;
  }
}
