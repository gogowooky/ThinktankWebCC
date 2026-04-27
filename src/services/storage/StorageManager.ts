/**
 * StorageManager.ts
 * ストレージバックエンドのシングルトン管理クラス
 *
 * window.__THINKTANK_MODE__ === 'local'
 *   → LocalStorageBackend（C# API @ window.__THINKTANK_LOCAL_API__）
 * それ以外（PWA / ブラウザ直接）
 *   → BigQueryStorageBackend（Express /api/bq/*）
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import { LocalStorageBackend }    from './LocalStorageBackend';
import { BigQueryStorageBackend } from './BigQueryStorageBackend';

export class StorageManager {
  private static _instance: StorageManager | null = null;

  public readonly backend: IStorageBackend;
  public readonly mode: 'local' | 'pwa';

  private constructor() {
    if (window.__THINKTANK_MODE__ === 'local') {
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

  public listMeta(vaultId: string): Promise<ThinkMeta[]> {
    return this.backend.listMeta(vaultId);
  }

  public getContent(vaultId: string, id: string): Promise<string | null> {
    return this.backend.getContent(vaultId, id);
  }

  public save(payload: SavePayload): Promise<ThinkMeta> {
    return this.backend.save(payload);
  }

  public delete(vaultId: string, id: string): Promise<void> {
    return this.backend.delete(vaultId, id);
  }

  public search(vaultId: string, query: string): Promise<ThinkMeta[]> {
    return this.backend.search(vaultId, query);
  }
}
