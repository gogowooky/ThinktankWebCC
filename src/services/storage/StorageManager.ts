/**
 * StorageManager.ts
 * デュアルライト・ストレージマネージャ
 *
 * 書き込み: IndexedDB（即時） + BigQuery（非同期）
 * 読み込み: IndexedDB優先 → BigQuery差分取得で更新
 *
 * BigQuery到達不可時はIndexedDBのみで動作（オフライン対応）。
 */

import type { FileRecord, VersionInfo } from './IStorageService';
import { BigQueryStorageService } from './BigQueryStorageService';
import { IndexedDBStorageService } from './IndexedDBStorageService';

export class StorageManager {
  private local: IndexedDBStorageService;
  private remote: BigQueryStorageService;
  private _remoteAvailable = false;
  private _initialized = false;

  /** サーバ接続状態 */
  get isRemoteAvailable(): boolean {
    return this._remoteAvailable;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  constructor() {
    this.local = new IndexedDBStorageService();
    this.remote = new BigQueryStorageService();
  }

  /**
   * 初期化: IndexedDB + BigQuery両方を初期化
   * BigQuery到達不可でもIndexedDBのみで続行
   */
  async initialize(): Promise<void> {
    const localOk = await this.local.initialize();
    if (!localOk) {
      console.error('[StorageManager] IndexedDB initialization failed');
    }

    this._remoteAvailable = await this.remote.initialize();
    if (this._remoteAvailable) {
      console.log('[StorageManager] Remote (BigQuery) available');
    } else {
      console.log('[StorageManager] Remote not available, running in local-only mode');
    }

    this._initialized = true;
  }

  /**
   * 全データロード
   * 1. IndexedDBから即時ロード
   * 2. BigQuery到達可能なら全データ取得してIndexedDBを更新
   *
   * @returns ロードされたFileRecord配列
   */
  async loadAll(): Promise<FileRecord[]> {
    let records = await this.local.getAllFiles();

    if (this._remoteAvailable) {
      try {
        const remoteRecords = await this.remote.getAllFiles();

        if (remoteRecords.length > 0) {
          // リモートデータでIndexedDBを更新
          await this.local.bulkSave(remoteRecords);
          records = remoteRecords;
          console.log(`[StorageManager] Synced ${remoteRecords.length} records from remote`);
        }
      } catch (error) {
        console.warn('[StorageManager] Remote load failed, using local cache:', error);
      }
    }

    return records;
  }

  /**
   * カテゴリ別ファイル一覧
   */
  async listFiles(category?: string): Promise<FileRecord[]> {
    return this.local.listFiles(category);
  }

  /**
   * 単一ファイル取得（ローカル優先、なければリモート）
   */
  async getFile(fileId: string): Promise<FileRecord | null> {
    const localRecord = await this.local.getFile(fileId);
    if (localRecord) return localRecord;

    if (this._remoteAvailable) {
      try {
        const remoteRecord = await this.remote.getFile(fileId);
        if (remoteRecord) {
          await this.local.saveFile(remoteRecord);
          return remoteRecord;
        }
      } catch (error) {
        console.warn(`[StorageManager] Remote getFile failed for ${fileId}:`, error);
      }
    }

    return null;
  }

  /**
   * ファイル保存（デュアルライト）
   * IndexedDB: 同期的に即時書き込み
   * BigQuery: 非同期（失敗してもローカルには保存済み）
   */
  async saveFile(record: FileRecord): Promise<void> {
    // ローカル即時保存
    await this.local.saveFile(record);

    // リモート非同期保存（エラーはログのみ）
    if (this._remoteAvailable) {
      this.remote.saveFile(record).catch(error => {
        console.warn(`[StorageManager] Remote save failed for ${record.file_id}:`, error);
      });
    }
  }

  /**
   * ファイル削除（デュアル）
   */
  async deleteFile(fileId: string): Promise<void> {
    await this.local.deleteFile(fileId);

    if (this._remoteAvailable) {
      this.remote.deleteFile(fileId).catch(error => {
        console.warn(`[StorageManager] Remote delete failed for ${fileId}:`, error);
      });
    }
  }

  /**
   * 一括保存（デュアルライト）
   */
  async bulkSave(records: FileRecord[]): Promise<void> {
    await this.local.bulkSave(records);

    if (this._remoteAvailable) {
      this.remote.bulkSave(records).catch(error => {
        console.warn('[StorageManager] Remote bulk save failed:', error);
      });
    }
  }

  /**
   * バージョン情報取得（差分同期用）
   */
  async getVersions(): Promise<VersionInfo[]> {
    if (this._remoteAvailable) {
      try {
        return await this.remote.getVersions();
      } catch {
        // fallback to local
      }
    }
    return this.local.getVersions();
  }
}

/** シングルトンインスタンス */
export const storageManager = new StorageManager();
