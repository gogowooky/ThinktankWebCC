/**
 * StorageManager.ts
 * ストレージサービスを管理するシングルトン
 * BigQuery + IndexedDB キャッシュ対応
 */

import type { IStorageService, IStorageManager, StorageType } from './IStorageService';
import { BigQueryStorageService, VersionInfo } from './BigQueryStorageService';
import { IndexedDBStorageService } from './IndexedDBStorageService';
import { conflictResolver } from './ConflictResolver';

export type ConnectionStatus = 'online' | 'offline' | 'syncing';

// キャッシュバージョン情報（IndexedDB内に保存）
const VERSION_KEY = '__bq_versions__';

class StorageManagerImpl implements IStorageManager {
    private _bigquery: BigQueryStorageService;
    private _local: IndexedDBStorageService;
    private _connectionStatus: ConnectionStatus = 'online';
    private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
    private cachedVersions: Map<string, string> = new Map();

    constructor() {
        this._bigquery = new BigQueryStorageService();
        this._local = new IndexedDBStorageService();
    }

    /**
     * BigQuery ストレージ
     */
    get bigquery(): BigQueryStorageService {
        return this._bigquery;
    }

    /**
     * cache/drive は bigquery へのエイリアス（後方互換性）
     */
    get cache(): IStorageService {
        return this._bigquery;
    }



    /**
     * ローカル IndexedDB ストレージ
     */
    get local(): IndexedDBStorageService {
        return this._local;
    }

    /**
     * 現在の接続ステータス
     */
    get connectionStatus(): ConnectionStatus {
        return this._connectionStatus;
    }

    /**
     * オンラインかどうか
     */
    get isOnline(): boolean {
        return navigator.onLine;
    }

    getStorage(type: StorageType): IStorageService {
        switch (type) {
            case 'bigquery':
                return this._bigquery;
            case 'local':
                return this._local;
            default:
                throw new Error(`Unknown storage type: ${type}`);
        }
    }

    /**
     * 初期化（IndexedDB を開き、バージョンチェックを実行）
     */
    async initialize(): Promise<void> {
        await this._local.initialize();

        // オンライン状態の監視を開始
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        this._connectionStatus = navigator.onLine ? 'online' : 'offline';

        // ローカルキャッシュからバージョン情報を読み込み
        await this.loadCachedVersions();

        // オンラインの場合はバージョンチェックを実行
        if (this.isOnline) {
            this.checkVersions();
        }

        console.log(`[StorageManager] Initialized (status: ${this._connectionStatus})`);
    }

    /**
     * バージョン情報をローカルから読み込み
     */
    private async loadCachedVersions(): Promise<void> {
        try {
            const result = await this._local.load(VERSION_KEY);
            if (result.success && result.data) {
                const versions = JSON.parse(result.data);
                this.cachedVersions = new Map(Object.entries(versions));
            }
        } catch (error) {
            console.warn('[StorageManager] バージョン情報読み込み失敗:', error);
        }
    }

    /**
     * バージョン情報をローカルに保存
     */
    private async saveCachedVersions(): Promise<void> {
        try {
            const versions = Object.fromEntries(this.cachedVersions);
            await this._local.save(VERSION_KEY, JSON.stringify(versions));
        } catch (error) {
            console.warn('[StorageManager] バージョン情報保存失敗:', error);
        }
    }

    /**
     * BigQueryとローカルキャッシュのバージョンを比較
     */
    async checkVersions(): Promise<string[]> {
        if (!this.isOnline) return [];

        try {
            this.setStatus('syncing');
            const result = await this._bigquery.getVersions();

            if (!result.success || !result.data) {
                this.setStatus('online');
                return [];
            }

            const outdated: string[] = [];

            for (const version of result.data as VersionInfo[]) {
                const cachedVersion = this.cachedVersions.get(version.file_id);
                if (!cachedVersion || cachedVersion !== version.updated_at) {
                    outdated.push(version.file_id);
                }
            }

            this.setStatus('online');
            return outdated;
        } catch (error) {
            console.error('[StorageManager] バージョンチェック失敗:', error);
            this.setStatus('online');
            return [];
        }
    }

    /**
     * 指定されたファイルのローカルキャッシュを更新
     */
    async syncFile(fileId: string): Promise<boolean> {
        if (!this.isOnline) return false;

        try {
            const result = await this._bigquery.load(`${fileId}.csv`);
            if (result.success && result.data) {
                await this._local.save(`${fileId}.csv`, result.data);

                // バージョン情報を更新
                const versions = await this._bigquery.getVersions();
                if (versions.success && versions.data) {
                    const fileVersion = (versions.data as VersionInfo[]).find(v => v.file_id === fileId);
                    if (fileVersion) {
                        this.cachedVersions.set(fileId, fileVersion.updated_at);
                        await this.saveCachedVersions();
                    }
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error(`[StorageManager] ファイル同期失敗 (${fileId}):`, error);
            return false;
        }
    }

    /**
     * ローカルキャッシュをクリア
     */
    async clearCache(): Promise<void> {
        try {
            await this._local.clear();
            this.cachedVersions.clear();
            console.log('[StorageManager] キャッシュをクリアしました');
        } catch (error) {
            console.error('[StorageManager] キャッシュクリア失敗:', error);
        }
    }

    /**
     * キャッシュを再構築（BigQueryから全データ取得）
     */
    async rebuildCache(): Promise<void> {
        if (!this.isOnline) {
            console.warn('[StorageManager] オフラインのためキャッシュ再構築スキップ');
            return;
        }

        try {
            this.setStatus('syncing');
            console.log('[StorageManager] キャッシュ再構築開始...');

            // 既存キャッシュをクリア
            await this._local.clear();
            this.cachedVersions.clear();

            // BigQueryから全データ取得
            const result = await this._bigquery.getAllFiles();

            if (result.success && result.data) {
                for (const file of result.data) {
                    // ローカルに保存
                    if (file.content) {
                        await this._local.save(file.file_id, file.content);
                    }
                    // バージョン情報を更新
                    this.cachedVersions.set(file.file_id, file.updated_at);
                }
                await this.saveCachedVersions();
                console.log(`[StorageManager] キャッシュ再構築完了: ${result.data.length} 件`);
            }

            this.setStatus('online');
        } catch (error) {
            console.error('[StorageManager] キャッシュ再構築失敗:', error);
            this.setStatus('online');
        }
    }

    /**
     * 接続ステータスリスナーを追加
     */
    addStatusListener(callback: (status: ConnectionStatus) => void): void {
        this.statusListeners.add(callback);
    }

    /**
     * 接続ステータスリスナーを削除
     */
    removeStatusListener(callback: (status: ConnectionStatus) => void): void {
        this.statusListeners.delete(callback);
    }

    private setStatus(status: ConnectionStatus): void {
        this._connectionStatus = status;
        this.statusListeners.forEach(cb => cb(status));
    }

    // ─────────────────────────────────────────────────────────────
    // 段202: SyncQueue flush + 保護API
    // ─────────────────────────────────────────────────────────────

    /**
     * SyncQueueのpendingChangesをBQに送信する。
     * 同一ファイルは最新エントリのみ送信。
     */
    async flushSyncQueue(): Promise<{ success: number; failed: number }> {
        const pending = await this._local.getPendingChanges();
        if (pending.length === 0) return { success: 0, failed: 0 };

        console.log(`[StorageManager] SyncQueue flush開始: ${pending.length}件`);

        // 同一ファイル(path)は最新タイムスタンプのみ送信
        const latest = new Map<string, typeof pending[0]>();
        for (const c of pending) {
            const existing = latest.get(c.path);
            if (!existing || c.timestamp > existing.timestamp) {
                latest.set(c.path, c);
            }
        }

        let success = 0;
        let failed = 0;

        for (const [path, change] of latest) {
            try {
                const payload = JSON.parse(change.content);

                // 段204: 衝突検出 — BQ上の更新日時とローカルの更新日時を比較
                const localUpdateDate = payload.updateDate as string | undefined;
                if (localUpdateDate) {
                    const isConflict = await conflictResolver.checkBeforeFlush(path, localUpdateDate);
                    if (isConflict) {
                        // 衝突: ローカル版を別メモとして保存し、BQ版を正とする
                        await conflictResolver.saveConflictVersion(path, payload.content ?? '', payload.title ?? path);
                        // SyncQueueから削除（BQ版が正なので送信しない）
                        for (const c of pending) {
                            if (c.path === path) {
                                await this._local.removePendingChange(c.id);
                            }
                        }
                        console.warn(`[StorageManager] 衝突検出: ${path} → 衝突メモを別IDで保存`);
                        this.statusListeners.forEach(cb => cb(this._connectionStatus));
                        continue;
                    }
                }

                const res = await fetch('/api/bq/files', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    // 該当pathの全エントリを削除
                    for (const c of pending) {
                        if (c.path === path) {
                            await this._local.removePendingChange(c.id);
                        }
                    }
                    success++;
                    console.log(`[StorageManager] SyncQueue flush成功: ${path}`);
                } else {
                    failed++;
                    console.warn(`[StorageManager] SyncQueue flush失敗 (${path}): HTTP ${res.status}`);
                }
            } catch (e) {
                failed++;
                console.warn(`[StorageManager] SyncQueue flush例外 (${path}):`, e);
            }
        }

        this.statusListeners.forEach(cb => cb(this._connectionStatus));
        console.log(`[StorageManager] SyncQueue flush完了: 成功${success}件, 失敗${failed}件`);
        return { success, failed };
    }

    /**
     * 未送信変更があるメモIDのSetを返す（SyncWithBigQuery保護用）
     */
    async getPendingMemoIds(): Promise<Set<string>> {
        const pending = await this._local.getPendingChanges();
        return new Set(pending.map(p => p.path));
    }

    /**
     * 未送信件数を返す（StatusBar用）
     */
    async getPendingCount(): Promise<number> {
        return (await this._local.getPendingChanges()).length;
    }

    private async handleOnline(): Promise<void> {
        console.log('[StorageManager] Online');
        this.setStatus('syncing');
        await this.flushSyncQueue();
        await this.checkVersions();
        this.setStatus('online');
    }

    private handleOffline(): void {
        console.log('[StorageManager] Offline');
        this.setStatus('offline');
    }
}

/**
 * StorageManager のシングルトンインスタンス
 */
export const StorageManager: IStorageManager & {
    bigquery: BigQueryStorageService;
    local: IndexedDBStorageService;
    connectionStatus: ConnectionStatus;
    isOnline: boolean;
    initialize(): Promise<void>;
    addStatusListener(callback: (status: ConnectionStatus) => void): void;
    removeStatusListener(callback: (status: ConnectionStatus) => void): void;
    checkVersions(): Promise<string[]>;
    syncFile(fileId: string): Promise<boolean>;
    clearCache(): Promise<void>;
    rebuildCache(): Promise<void>;
    // 段202: SyncQueue API
    flushSyncQueue(): Promise<{ success: number; failed: number }>;
    getPendingMemoIds(): Promise<Set<string>>;
    getPendingCount(): Promise<number>;
} = new StorageManagerImpl();

