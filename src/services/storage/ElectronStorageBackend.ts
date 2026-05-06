/**
 * ElectronStorageBackend.ts
 * Electron IPC 経由でメインプロセスの fs 操作を呼び出すバックエンド
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';

export interface SyncResult {
  added: number; updated: number; skipped: number; total: number;
}

declare global {
  interface Window {
    electronAPI?: {
      storage: {
        listMeta:       ()                => Promise<ThinkMeta[]>;
        getContent:     (id: string)      => Promise<string | null>;
        save:           (p: SavePayload)  => Promise<ThinkMeta>;
        delete:         (id: string)      => Promise<void>;
        search:         (q: string)       => Promise<ThinkMeta[]>;
        syncFromServer: (url: string)     => Promise<SyncResult>;
      };
      getPathForFile: (file: File) => string;
    };
  }
}

export class ElectronStorageBackend implements IStorageBackend {
  private get api() {
    const api = window.electronAPI?.storage;
    if (!api) throw new Error('[ElectronStorageBackend] electronAPI が見つかりません');
    return api;
  }

  listMeta():                   Promise<ThinkMeta[]>   { return this.api.listMeta(); }
  getContent(id: string):       Promise<string | null> { return this.api.getContent(id); }
  save(payload: SavePayload):   Promise<ThinkMeta>     { return this.api.save(payload); }
  delete(id: string):           Promise<void>          { return this.api.delete(id); }
  search(query: string):        Promise<ThinkMeta[]>   { return this.api.search(query); }

  syncFromServer(serverUrl = 'http://localhost:8080'): Promise<SyncResult> {
    return this.api.syncFromServer(serverUrl);
  }
}
