/**
 * IndexedDBStorageService.ts
 * IndexedDB を使用したオフライン対応ストレージサービス
 */

import type { IStorageService, StorageResult } from './IStorageService';

const DB_NAME = 'ThinktankDB';
const DB_VERSION = 1;

// ストア名
const STORES = {
    files: 'files',           // ファイルデータ
    pendingChanges: 'pending', // オフライン時の変更キュー
    syncMeta: 'syncMeta'      // 同期メタデータ
};

/**
 * IndexedDB をラップしたストレージサービス
 */
export class IndexedDBStorageService implements IStorageService {
    readonly name = 'IndexedDBStorage';
    private db: IDBDatabase | null = null;

    /**
     * データベースを初期化
     */
    async initialize(): Promise<boolean> {
        if (this.db) return true;

        return new Promise((resolve) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error(`[${this.name}] Failed to open database`);
                resolve(false);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log(`[${this.name}] Database initialized`);
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // ファイルストア（パスをキーとして使用）
                if (!db.objectStoreNames.contains(STORES.files)) {
                    db.createObjectStore(STORES.files, { keyPath: 'path' });
                }

                // 変更キュー（自動生成ID）
                if (!db.objectStoreNames.contains(STORES.pendingChanges)) {
                    const pendingStore = db.createObjectStore(STORES.pendingChanges, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    pendingStore.createIndex('path', 'path', { unique: false });
                }

                // 同期メタデータ
                if (!db.objectStoreNames.contains(STORES.syncMeta)) {
                    db.createObjectStore(STORES.syncMeta, { keyPath: 'key' });
                }

                console.log(`[${this.name}] Database schema created/updated`);
            };
        });
    }

    /**
     * データベースが初期化されているか確認
     */
    private async ensureDB(): Promise<IDBDatabase | null> {
        if (!this.db) {
            await this.initialize();
        }
        return this.db;
    }

    /**
     * ファイルを保存
     */
    async save(path: string, content: string): Promise<StorageResult> {
        const db = await this.ensureDB();
        if (!db) return { success: false, error: 'Database not initialized' };

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.files], 'readwrite');
            const store = transaction.objectStore(STORES.files);

            const data = {
                path,
                content,
                updatedAt: Date.now()
            };

            const request = store.put(data);

            request.onsuccess = () => {
                console.log(`[${this.name}] Saved: ${path}`);
                resolve({ success: true });
            };

            request.onerror = () => {
                console.error(`[${this.name}] Save failed:`, request.error);
                resolve({ success: false, error: request.error?.message || 'Save failed' });
            };
        });
    }

    /**
     * ファイルを読み込み
     */
    async load(path: string): Promise<StorageResult<string | null>> {
        const db = await this.ensureDB();
        if (!db) return { success: false, error: 'Database not initialized' };

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.files], 'readonly');
            const store = transaction.objectStore(STORES.files);
            const request = store.get(path);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    resolve({ success: true, data: result.content });
                } else {
                    resolve({ success: true, data: null });
                }
            };

            request.onerror = () => {
                resolve({ success: false, error: request.error?.message || 'Load failed' });
            };
        });
    }

    /**
     * ファイルが存在するか確認
     */
    async exists(path: string): Promise<StorageResult<boolean>> {
        const result = await this.load(path);
        return { success: true, data: result.success && result.data !== null };
    }

    /**
     * ファイル一覧を取得（プレフィックスでフィルタ）
     */
    async list(directory: string, pattern?: string): Promise<StorageResult<string[]>> {
        const db = await this.ensureDB();
        if (!db) return { success: false, error: 'Database not initialized' };

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.files], 'readonly');
            const store = transaction.objectStore(STORES.files);
            const request = store.getAllKeys();

            request.onsuccess = () => {
                let files = (request.result as string[]) || [];

                // ディレクトリでフィルタ
                if (directory) {
                    const prefix = directory.endsWith('/') ? directory : `${directory}/`;
                    files = files.filter(f => f.startsWith(prefix));
                }

                // パターンでフィルタ（*.md など）
                if (pattern) {
                    const ext = pattern.replace('*', '');
                    files = files.filter(f => f.endsWith(ext));
                }

                resolve({ success: true, data: files });
            };

            request.onerror = () => {
                resolve({ success: false, error: request.error?.message || 'List failed' });
            };
        });
    }

    /**
     * ファイルを削除
     */
    async delete(path: string): Promise<StorageResult> {
        const db = await this.ensureDB();
        if (!db) return { success: false, error: 'Database not initialized' };

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.files], 'readwrite');
            const store = transaction.objectStore(STORES.files);
            const request = store.delete(path);

            request.onsuccess = () => {
                console.log(`[${this.name}] Deleted: ${path}`);
                resolve({ success: true });
            };

            request.onerror = () => {
                resolve({ success: false, error: request.error?.message || 'Delete failed' });
            };
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 変更キュー関連（オフライン同期用）
    // ═══════════════════════════════════════════════════════════

    /**
     * 変更をキューに追加
     */
    async addPendingChange(path: string, content: string, action: 'save' | 'delete'): Promise<boolean> {
        const db = await this.ensureDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.pendingChanges], 'readwrite');
            const store = transaction.objectStore(STORES.pendingChanges);

            const change = {
                path,
                content,
                action,
                timestamp: Date.now()
            };

            const request = store.add(change);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    /**
     * 保留中の変更を取得
     */
    async getPendingChanges(): Promise<Array<{ id: number; path: string; content: string; action: string; timestamp: number }>> {
        const db = await this.ensureDB();
        if (!db) return [];

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.pendingChanges], 'readonly');
            const store = transaction.objectStore(STORES.pendingChanges);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => resolve([]);
        });
    }

    /**
     * 変更を削除（同期完了後）
     */
    async removePendingChange(id: number): Promise<boolean> {
        const db = await this.ensureDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.pendingChanges], 'readwrite');
            const store = transaction.objectStore(STORES.pendingChanges);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    /**
     * 全ての変更をクリア
     */
    async clearPendingChanges(): Promise<boolean> {
        const db = await this.ensureDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.pendingChanges], 'readwrite');
            const store = transaction.objectStore(STORES.pendingChanges);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    }

    /**
     * 全てのファイルデータをクリア（キャッシュ再構築用）
     */
    async clear(): Promise<boolean> {
        const db = await this.ensureDB();
        if (!db) return false;

        return new Promise((resolve) => {
            const transaction = db.transaction([STORES.files], 'readwrite');
            const store = transaction.objectStore(STORES.files);
            const request = store.clear();

            request.onsuccess = () => {
                console.log(`[${this.name}] All files cleared`);
                resolve(true);
            };
            request.onerror = () => resolve(false);
        });
    }
}
