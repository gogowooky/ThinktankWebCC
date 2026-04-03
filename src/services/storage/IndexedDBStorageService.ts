/**
 * IndexedDBStorageService.ts
 * ブラウザ IndexedDB を使ったローカルキャッシュ実装
 *
 * DB名: thinktank
 * ObjectStore: files (keyPath: file_id)
 * Index: by_category (category), by_updated (updated_at)
 */

import type { IStorageService, FileRecord, VersionInfo } from './IStorageService';

const DB_NAME = 'thinktank';
const DB_VERSION = 1;
const STORE_NAME = 'files';

export class IndexedDBStorageService implements IStorageService {
  readonly name = 'IndexedDB';
  private db: IDBDatabase | null = null;

  async initialize(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'file_id' });
            store.createIndex('by_category', 'category', { unique: false });
            store.createIndex('by_updated', 'updated_at', { unique: false });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          console.log('[IndexedDB] Initialized');
          resolve(true);
        };

        request.onerror = () => {
          console.error('[IndexedDB] Open failed:', request.error);
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  private getStore(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('IndexedDB not initialized');
    const tx = this.db.transaction(STORE_NAME, mode);
    return tx.objectStore(STORE_NAME);
  }

  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async listFiles(category?: string): Promise<FileRecord[]> {
    const store = this.getStore('readonly');
    let records: FileRecord[];

    if (category) {
      const index = store.index('by_category');
      records = await this.request(index.getAll(category));
    } else {
      records = await this.request(store.getAll());
    }

    return records.sort((a, b) =>
      (b.updated_at || '').localeCompare(a.updated_at || ''),
    );
  }

  async getFile(fileId: string): Promise<FileRecord | null> {
    const store = this.getStore('readonly');
    const result = await this.request(store.get(fileId));
    return result || null;
  }

  async saveFile(record: FileRecord): Promise<void> {
    const store = this.getStore('readwrite');
    await this.request(store.put(record));
  }

  async deleteFile(fileId: string): Promise<void> {
    const store = this.getStore('readwrite');
    await this.request(store.delete(fileId));
  }

  async getAllFiles(): Promise<FileRecord[]> {
    const store = this.getStore('readonly');
    return this.request(store.getAll());
  }

  async getVersions(): Promise<VersionInfo[]> {
    const all = await this.getAllFiles();
    return all.map(f => ({
      file_id: f.file_id,
      updated_at: f.updated_at,
    }));
  }

  async bulkSave(records: FileRecord[]): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const record of records) {
        store.put(record);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
