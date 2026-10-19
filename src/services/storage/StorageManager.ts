/**
 * StorageManager.ts
 * ストレージバックエンドのシングルトン管理クラス
 *
 * - Electron (PCアプリ): ElectronStorageBackend（IPC 経由で VaultEngine 操作）
 * - Web / PWA: DriveApiStorageBackend（Google Drive API）または LocalRelayStorageBackend（ローカル中継サーバ /api/vault/*）
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import { LocalRelayStorageBackend } from './LocalRelayStorageBackend';
import { ElectronStorageBackend } from './ElectronStorageBackend';
import { DriveApiStorageBackend } from '../../platform/web/DriveApiStorageBackend';
import { GoogleAuthService } from '../../platform/web/GoogleAuthService';

const WEB_STORAGE_PROVIDER_KEY = 'tt_web_storage_provider'; // 'drive' | 'local'

export class StorageManager {
  private static _instance: StorageManager | null = null;

  public backend: IStorageBackend;
  public readonly mode: 'electron' | 'pwa';
  public webProvider: 'drive' | 'local' = 'local';

  private constructor() {
    if (window.electronAPI) {
      this.backend = new ElectronStorageBackend();
      this.mode    = 'electron';
      console.log('[StorageManager] mode=electron (IPC fs)');
    } else {
      this.mode = 'pwa';
      const preferred =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(WEB_STORAGE_PROVIDER_KEY)
          : null;
      const isLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      // 本番Webホスティング環境（Firebase Hosting等）ではローカル中継に届かないため、
      // 明示的に local が選ばれていない限り drive（Google Drive API）を既定にする
      const shouldUseDrive =
        preferred === 'drive' ||
        (!isLocalhost && preferred !== 'local') ||
        (preferred !== 'local' && GoogleAuthService.hasValidToken());

      if (shouldUseDrive) {
        this.backend = new DriveApiStorageBackend();
        this.webProvider = 'drive';
        console.log('[StorageManager] mode=pwa (Google Drive + IndexedDB Cache)');
      } else {
        this.backend = new LocalRelayStorageBackend();
        this.webProvider = 'local';
        console.log('[StorageManager] mode=pwa (Local relay server)');
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
   * Web版のストレージプロバイダ（'drive' | 'local'）を動的に切り替える。
   */
  public setWebProvider(provider: 'drive' | 'local'): void {
    if (this.mode !== 'pwa') return;
    this.webProvider = provider;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEB_STORAGE_PROVIDER_KEY, provider);
    }
    this.backend =
      provider === 'drive' ? new DriveApiStorageBackend() : new LocalRelayStorageBackend();
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
}

