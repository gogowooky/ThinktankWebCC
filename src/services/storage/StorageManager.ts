/**
 * StorageManager.ts
 * ストレージバックエンドのシングルトン管理クラス
 *
 * window.__THINKTANK_MODE__ === 'local'
 *   → LocalStorageBackend（C# API @ window.__THINKTANK_LOCAL_API__）
 * それ以外（PWA / ブラウザ直接）
 *   → BigQueryStorageBackend（Express /api/bq/*）
 */

import type { IStorageBackend, ThinkMeta, SavePayload, HistoryMeta, SaveHistoryPayload } from './IStorageBackend';
import { LocalStorageBackend }    from './LocalStorageBackend';
import { BigQueryStorageBackend } from './BigQueryStorageBackend';
import { ElectronStorageBackend, type SyncResult } from './ElectronStorageBackend';

export class StorageManager {
  private static _instance: StorageManager | null = null;

  public readonly backend: IStorageBackend;
  public readonly mode: 'electron' | 'local' | 'pwa';

  private constructor() {
    if (window.electronAPI) {
      this.backend = new ElectronStorageBackend();
      this.mode    = 'electron';
      console.log('[StorageManager] mode=electron (IPC fs)');
    } else if (window.__THINKTANK_MODE__ === 'local') {
      const apiUrl = window.__THINKTANK_LOCAL_API__ ?? 'http://localhost:8081';
      this.backend = new LocalStorageBackend(apiUrl);
      this.mode    = 'local';
      console.log(`[StorageManager] mode=local, api=${apiUrl}`);
    } else {
      this.backend = new BigQueryStorageBackend();
      this.mode    = 'pwa';
      console.log('[StorageManager] mode=pwa (BigQuery via Express)');
    }
  }

  public static get instance(): StorageManager {
    if (!StorageManager._instance) {
      StorageManager._instance = new StorageManager();
    }
    return StorageManager._instance;
  }

  // ── 公開メソッド（TTVault / TTThink から呼ぶ） ─────────────────────

  public listMeta(): Promise<ThinkMeta[]> {
    return this.backend.listMeta();
  }

  public getContent(id: string): Promise<string | null> {
    return this.backend.getContent(id);
  }

  public save(payload: SavePayload): Promise<ThinkMeta> {
    return this.backend.save(payload);
  }

  public delete(id: string): Promise<void> {
    return this.backend.delete(id);
  }

  public search(query: string): Promise<ThinkMeta[]> {
    return this.backend.search(query);
  }

  public listHistoryMeta(thinkId: string): Promise<HistoryMeta[]> {
    return this.backend.listHistoryMeta(thinkId);
  }

  public getHistoryContent(historyId: string): Promise<string | null> {
    return this.backend.getHistoryContent(historyId);
  }

  public saveHistory(payload: SaveHistoryPayload): Promise<HistoryMeta> {
    return this.backend.saveHistory(payload);
  }

  public syncFromServer(serverUrl = 'http://localhost:8080'): Promise<SyncResult> {
    if (this.mode !== 'electron') {
      return Promise.reject(new Error('[StorageManager] syncFromServer は Electron モードのみ利用可能'));
    }
    return (this.backend as ElectronStorageBackend).syncFromServer(serverUrl);
  }
}
