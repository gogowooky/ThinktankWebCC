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
import { ElectronStorageBackend, type SyncResult } from './ElectronStorageBackend';
import { DriveApiStorageBackend } from '../../platform/web/DriveApiStorageBackend';
import { GoogleAuthService } from '../../platform/web/GoogleAuthService';

const WEB_STORAGE_PROVIDER_KEY = 'tt_web_storage_provider'; // 'drive' | 'bigquery'

export class StorageManager {
  private static _instance: StorageManager | null = null;

  public backend: IStorageBackend;
  public readonly mode: 'electron' | 'local' | 'pwa';
  public webProvider: 'drive' | 'bigquery' = 'bigquery';

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
      this.mode = 'pwa';
      const preferred =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(WEB_STORAGE_PROVIDER_KEY)
          : null;
      if (preferred === 'drive' || (preferred !== 'bigquery' && GoogleAuthService.hasValidToken())) {
        this.backend = new DriveApiStorageBackend();
        this.webProvider = 'drive';
        console.log('[StorageManager] mode=pwa (Google Drive + IndexedDB Cache)');
      } else {
        this.backend = new BigQueryStorageBackend();
        this.webProvider = 'bigquery';
        console.log('[StorageManager] mode=pwa (BigQuery via Express)');
      }
    }
  }

  public static get instance(): StorageManager {
    if (!StorageManager._instance) {
      StorageManager._instance = new StorageManager();
    }
    return StorageManager._instance;
  }

  /**
   * Web版のストレージプロバイダ（'drive' | 'bigquery'）を動的に切り替える。
   */
  public setWebProvider(provider: 'drive' | 'bigquery'): void {
    if (this.mode !== 'pwa') return;
    this.webProvider = provider;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEB_STORAGE_PROVIDER_KEY, provider);
    }
    this.backend =
      provider === 'drive' ? new DriveApiStorageBackend() : new BigQueryStorageBackend();
  }

  public getDriveBackend(): DriveApiStorageBackend | null {
    return this.backend instanceof DriveApiStorageBackend ? this.backend : null;
  }

  // ── 公開メソッド（TTVault / TTThink から呼ぶ） ─────────────────────

  public listMeta(): Promise<ThinkMeta[]> {
    return this.backend.listMeta();
  }

  /** 本文のみ（タイトル行を含まない）。TTThink.Content とは別物。 */
  public getBody(id: string): Promise<string | null> {
    return this.backend.getBody(id);
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

  public syncFromServer(serverUrl?: string): Promise<SyncResult> {
    if (this.mode !== 'electron') {
      return Promise.reject(new Error('[StorageManager] syncFromServer は Electron モードのみ利用可能'));
    }
    return (this.backend as ElectronStorageBackend).syncFromServer(serverUrl);
  }
}

