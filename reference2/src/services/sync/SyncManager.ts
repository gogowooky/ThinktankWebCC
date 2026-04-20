/**
 * SyncManager.ts
 * オンライン/オフライン同期を管理するマネージャー
 */

import { IndexedDBStorageService } from '../storage/IndexedDBStorageService';
import { BigQueryStorageService } from '../storage/BigQueryStorageService';

export type SyncStatus = 'online' | 'offline' | 'syncing';
export type SyncProgressCallback = (current: number, total: number) => void;

/**
 * 同期マネージャー
 * - オンライン状態の監視
 * - オフライン時の変更キュー管理
 * - オンライン復帰時の自動同期
 */
export class SyncManager {
    private static _instance: SyncManager | null = null;

    private localDB: IndexedDBStorageService;
    private remoteStorage: BigQueryStorageService;
    private _status: SyncStatus = 'online';
    private _pendingCount: number = 0;
    private _lastSyncTime: number | null = null;
    private statusListeners: Set<(status: SyncStatus) => void> = new Set();

    private constructor() {
        this.localDB = new IndexedDBStorageService();
        this.remoteStorage = new BigQueryStorageService();
    }

    static get Instance(): SyncManager {
        if (!SyncManager._instance) {
            SyncManager._instance = new SyncManager();
        }
        return SyncManager._instance;
    }

    get status(): SyncStatus {
        return this._status;
    }

    get pendingCount(): number {
        return this._pendingCount;
    }

    get lastSyncTime(): number | null {
        return this._lastSyncTime;
    }

    get isOnline(): boolean {
        return navigator.onLine;
    }

    /**
     * 初期化
     */
    async initialize(): Promise<void> {
        await this.localDB.initialize();

        // オンライン状態を監視
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        // 初期状態を設定
        this._status = navigator.onLine ? 'online' : 'offline';

        // 保留中の変更数を取得
        const pending = await this.localDB.getPendingChanges();
        this._pendingCount = pending.length;

        console.log(`[SyncManager] Initialized (status: ${this._status}, pending: ${this._pendingCount})`);
    }

    /**
     * ステータス変更リスナーを追加
     */
    addStatusListener(callback: (status: SyncStatus) => void): void {
        this.statusListeners.add(callback);
    }

    /**
     * ステータス変更リスナーを削除
     */
    removeStatusListener(callback: (status: SyncStatus) => void): void {
        this.statusListeners.delete(callback);
    }

    private setStatus(status: SyncStatus): void {
        this._status = status;
        this.statusListeners.forEach(cb => cb(status));
    }

    /**
     * オンライン復帰時の処理
     */
    private async handleOnline(): Promise<void> {
        console.log('[SyncManager] Online');
        this.setStatus('online');

        // 保留中の変更がある場合は同期
        if (this._pendingCount > 0) {
            await this.syncPendingChanges();
        }
    }

    /**
     * オフライン時の処理
     */
    private handleOffline(): void {
        console.log('[SyncManager] Offline');
        this.setStatus('offline');
    }

    /**
     * ファイルを保存（オフライン対応）
     */
    async saveFile(path: string, content: string): Promise<boolean> {
        // ローカルに保存
        await this.localDB.save(path, content);

        if (this.isOnline) {
            // オンラインの場合はリモートにも保存
            const result = await this.remoteStorage.save(path, content);
            if (!result.success) {
                // リモート保存失敗時はキューに追加
                await this.addToPending(path, content, 'save');
            }
            return result.success;
        } else {
            // オフラインの場合はキューに追加
            await this.addToPending(path, content, 'save');
            return true;
        }
    }

    /**
     * ファイルを読み込み（オフライン対応）
     */
    async loadFile(path: string): Promise<string | null> {
        if (this.isOnline) {
            // オンラインの場合はリモートから取得
            const result = await this.remoteStorage.load(path);
            if (result.success && result.data !== null && result.data !== undefined) {
                // ローカルにもキャッシュ
                await this.localDB.save(path, result.data);
                return result.data;
            }
        }

        // オフラインまたはリモート取得失敗時はローカルから取得
        const localResult = await this.localDB.load(path);
        return localResult.success ? (localResult.data ?? null) : null;
    }

    /**
     * 保留中の変更をキューに追加
     */
    private async addToPending(path: string, content: string, action: 'save' | 'delete'): Promise<void> {
        await this.localDB.addPendingChange(path, content, action);
        this._pendingCount++;
    }

    /**
     * 保留中の変更を同期
     */
    async syncPendingChanges(progressCallback?: SyncProgressCallback): Promise<void> {
        const pending = await this.localDB.getPendingChanges();
        if (pending.length === 0) return;

        this.setStatus('syncing');
        console.log(`[SyncManager] Syncing ${pending.length} pending changes...`);

        let synced = 0;
        for (const change of pending) {
            try {
                if (change.action === 'save') {
                    await this.remoteStorage.save(change.path, change.content);
                } else if (change.action === 'delete') {
                    await this.remoteStorage.delete(change.path);
                }
                await this.localDB.removePendingChange(change.id);
                synced++;
                this._pendingCount--;

                if (progressCallback) {
                    progressCallback(synced, pending.length);
                }
            } catch (error) {
                console.error(`[SyncManager] Failed to sync: ${change.path}`, error);
            }
        }

        this._lastSyncTime = Date.now();
        this.setStatus('online');
        console.log(`[SyncManager] Sync complete (${synced}/${pending.length})`);
    }

    /**
     * 完全同期（キャッシュリセット時）
     */
    async fullSync(progressCallback?: SyncProgressCallback): Promise<void> {
        if (!this.isOnline) {
            console.warn('[SyncManager] Cannot full sync while offline');
            return;
        }

        this.setStatus('syncing');
        console.log('[SyncManager] Starting full sync...');

        try {
            // ファイル一覧を取得
            const listResult = await this.remoteStorage.list('', '*.md');
            if (!listResult.success || !listResult.data) return;

            const files = listResult.data;
            let synced = 0;

            for (const file of files) {
                const result = await this.remoteStorage.load(file);
                if (result.success && result.data) {
                    await this.localDB.save(file, result.data);
                }
                synced++;

                if (progressCallback) {
                    progressCallback(synced, files.length);
                }
            }

            this._lastSyncTime = Date.now();
            console.log(`[SyncManager] Full sync complete (${synced} files)`);
        } finally {
            this.setStatus('online');
        }
    }
}
