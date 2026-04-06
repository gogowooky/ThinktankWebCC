/**
 * StorageManager.ts
 * デュアルライト・ストレージマネージャ
 *
 * 書き込み: IndexedDB（即時、dirty付き） + BigQuery（非同期、成功時dirtyクリア）
 * 読み込み: IndexedDB即時ロード → BigQueryとタイムスタンプ比較マージ
 *
 * オフライン対策:
 * - BQ送信失敗時: IndexedDBにdirty=trueで保持
 * - 接続復帰時: dirtyレコードをBQにリトライ送信
 * - 起動時マージ: updated_atを比較し、ローカルが新しければローカル優先
 */

import type { FileRecord, VersionInfo } from './IStorageService';
import { BigQueryStorageService } from './BigQueryStorageService';
import { IndexedDBStorageService } from './IndexedDBStorageService';

export class StorageManager {
  private local: IndexedDBStorageService;
  private remote: BigQueryStorageService;
  private _remoteAvailable = false;
  private _initialized = false;
  private _flushingDirty = false;

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

    // 接続可能ならダーティキューをフラッシュ
    if (this._remoteAvailable) {
      this.flushDirtyQueue();
    }
  }

  /**
   * 全データロード（タイムスタンプ比較マージ）
   *
   * 1. IndexedDBから全データロード
   * 2. BigQuery到達可能ならリモート全データ取得
   * 3. レコードごとにupdated_atを比較:
   *    - ローカルが新しい → ローカルを維持（BQへ送信）
   *    - リモートが新しい → リモートで上書き
   *    - リモートのみ存在 → IndexedDBに追加
   */
  async loadAll(): Promise<FileRecord[]> {
    const localRecords = await this.local.getAllFiles();
    const localMap = new Map<string, FileRecord>();
    for (const r of localRecords) {
      localMap.set(r.file_id, r);
    }

    if (!this._remoteAvailable) {
      return localRecords;
    }

    try {
      const remoteRecords = await this.remote.getAllFiles();
      const remoteMap = new Map<string, FileRecord>();
      for (const r of remoteRecords) {
        remoteMap.set(r.file_id, r);
      }

      const mergedMap = new Map<string, FileRecord>();
      const localWins: FileRecord[] = []; // ローカルが新しい → BQに送信

      // ローカルレコードを走査
      for (const [id, localRec] of localMap) {
        const remoteRec = remoteMap.get(id);
        if (!remoteRec) {
          // ローカルのみ存在（オフライン中に作成）→ BQに送信
          mergedMap.set(id, localRec);
          localWins.push(localRec);
        } else if (localRec.updated_at > remoteRec.updated_at) {
          // ローカルが新しい → ローカル優先、BQに送信
          mergedMap.set(id, localRec);
          localWins.push(localRec);
        } else {
          // リモートが新しいor同じ → リモート優先
          mergedMap.set(id, { ...remoteRec, _dirty: undefined });
        }
      }

      // リモートのみ存在するレコードを追加
      for (const [id, remoteRec] of remoteMap) {
        if (!localMap.has(id)) {
          mergedMap.set(id, { ...remoteRec, _dirty: undefined });
        }
      }

      // マージ結果をIndexedDBに保存
      const mergedRecords = Array.from(mergedMap.values());
      await this.local.bulkSave(mergedRecords);

      // ローカル優先レコードをBQに送信
      if (localWins.length > 0) {
        console.log(`[StorageManager] ${localWins.length} local records are newer, pushing to BQ`);
        this.remote.bulkSave(localWins).then(() => {
          // 成功時: dirtyフラグをクリア
          this.local.clearDirtyBatch(localWins.map(r => r.file_id));
        }).catch(error => {
          console.warn('[StorageManager] Failed to push local-wins to BQ:', error);
        });
      }

      console.log(`[StorageManager] Merged: ${mergedRecords.length} records (${localWins.length} local-wins)`);
      return mergedRecords;
    } catch (error) {
      console.warn('[StorageManager] Remote load failed, using local cache:', error);
      return localRecords;
    }
  }

  /**
   * カテゴリ別ファイル一覧
   */
  async listFiles(category?: string): Promise<FileRecord[]> {
    return this.local.listFiles(category);
  }

  /**
   * BQタイムスタンプを正規化（{value: "..."} 形式 or 文字列 → 文字列）
   */
  private normalizeBqTimestamp(ts: unknown): string {
    if (typeof ts === 'object' && ts !== null && 'value' in (ts as Record<string, unknown>)) {
      return String((ts as { value: string }).value);
    }
    return String(ts);
  }

  /**
   * BQレコードをローカル形式に変換（カテゴリ変換 + タイムスタンプ正規化）
   */
  private convertRemoteRecord(remoteRec: FileRecord, localCategory: string): FileRecord {
    return {
      ...remoteRec,
      category: localCategory,
      updated_at: this.normalizeBqTimestamp(remoteRec.updated_at),
      created_at: this.normalizeBqTimestamp(remoteRec.created_at),
      _dirty: undefined,
    };
  }

  /**
   * カテゴリ別差分同期（BQ ↔ IndexedDB）
   *
   * 手順:
   * 1. IndexedDBからカテゴリのローカルデータ取得
   * 2. BQからバージョン情報のみ取得（file_id + updated_at、contentなし → 軽量）
   * 3. file_idごとにupdated_atを比較し、差分を特定:
   *    - ローカルが新しい or 同じ → スキップ
   *    - リモートが新しい → 要取得リストに追加
   *    - リモートのみ存在 → 要取得リストに追加
   * 4. 差分のfile_idのみBQからcontent付きで一括取得
   * 5. マージ結果をIndexedDBに保存
   *
   * @param localCategory IndexedDB側のカテゴリ名（例: 'memos'）
   * @param remoteCategory BQ側のカテゴリ名（例: 'Memo'）。省略時はlocalCategoryと同じ
   * @returns マージ後のレコード一覧
   */
  async syncCategory(localCategory: string, remoteCategory?: string): Promise<FileRecord[]> {
    const bqCategory = remoteCategory || localCategory;

    // 1. ローカルデータ取得
    const localRecords = await this.local.listFiles(localCategory);
    const localMap = new Map<string, FileRecord>();
    for (const r of localRecords) {
      localMap.set(r.file_id, r);
    }

    if (!this._remoteAvailable) {
      return localRecords;
    }

    try {
      // 2. BQからバージョン情報のみ取得（軽量: file_id + updated_at のみ）
      const versionRes = await fetch(`/api/bq/versions?category=${encodeURIComponent(bqCategory)}`);
      if (!versionRes.ok) {
        console.warn(`[StorageManager] syncCategory: BQ versions fetch failed (${versionRes.status})`);
        return localRecords;
      }
      const versionData = await versionRes.json();
      const remoteVersions: { file_id: string; updated_at: unknown }[] = versionData.versions || [];

      if (remoteVersions.length === 0 && localRecords.length === 0) {
        console.log(`[StorageManager] syncCategory(${localCategory}←${bqCategory}): empty on both sides`);
        return [];
      }

      // 3. 差分を特定: リモートが新しい or リモートのみ存在 → 要取得
      const needFetchIds: string[] = [];
      let localWins = 0;

      for (const rv of remoteVersions) {
        const remoteTime = new Date(this.normalizeBqTimestamp(rv.updated_at)).getTime();
        const localRec = localMap.get(rv.file_id);

        if (!localRec) {
          // リモートのみ存在 → 要取得
          needFetchIds.push(rv.file_id);
        } else {
          const localTime = new Date(localRec.updated_at).getTime();
          if (localTime >= remoteTime) {
            localWins++;
          } else {
            // リモートが新しい → 要取得
            needFetchIds.push(rv.file_id);
          }
        }
      }
      console.log(
        `[StorageManager] syncCategory(${localCategory}←${bqCategory}): ` +
        `BQ has ${remoteVersions.length}, local has ${localRecords.length}, ` +
        `need fetch: ${needFetchIds.length}, local wins: ${localWins}`
      );

      // 4. 差分のみBQからcontent付きで取得
      if (needFetchIds.length > 0) {
        const FETCH_BATCH = 500; // BQへの一回のリクエストで取得するID数
        const fetchedRecords: FileRecord[] = [];

        for (let i = 0; i < needFetchIds.length; i += FETCH_BATCH) {
          const batchIds = needFetchIds.slice(i, i + FETCH_BATCH);
          const fetchRes = await fetch('/api/bq/fetch-by-ids', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileIds: batchIds, category: bqCategory }),
          });

          if (!fetchRes.ok) {
            console.warn(`[StorageManager] syncCategory: fetch-by-ids failed (${fetchRes.status})`);
            continue;
          }

          const fetchData = await fetchRes.json();
          const records: FileRecord[] = fetchData.files || [];
          fetchedRecords.push(...records);
        }

        // 5. 取得したレコードをローカル形式に変換してIndexedDBに保存
        if (fetchedRecords.length > 0) {
          const toSave = fetchedRecords.map(r => this.convertRemoteRecord(r, localCategory));
          const SAVE_BATCH = 100;
          for (let i = 0; i < toSave.length; i += SAVE_BATCH) {
            await this.local.bulkSave(toSave.slice(i, i + SAVE_BATCH));
          }

          // localMapにも反映（戻り値用）
          for (const rec of toSave) {
            localMap.set(rec.file_id, rec);
          }
        }

        console.log(
          `[StorageManager] syncCategory: fetched ${fetchedRecords.length} records from BQ, ` +
          `saved to IndexedDB`
        );
      } else {
        console.log(`[StorageManager] syncCategory: no changes needed, all up to date`);
      }

      // ローカルのみ存在するレコードも含めた全件を返す
      return Array.from(localMap.values());
    } catch (error) {
      console.warn('[StorageManager] syncCategory failed, using local:', error);
      return localRecords;
    }
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
   * ファイル保存（デュアルライト + ダーティキュー）
   *
   * 1. IndexedDBにdirty=trueで即時保存
   * 2. BigQuery非同期送信
   * 3. 成功時: dirtyフラグをクリア
   * 4. 失敗時: dirty=trueのまま保持（次回接続時にリトライ）
   */
  async saveFile(record: FileRecord): Promise<void> {
    // ローカルにdirty付きで保存
    await this.local.saveAsDirty(record);

    // リモート非同期保存
    if (this._remoteAvailable) {
      // _dirtyフラグを除去してBQに送信
      const { _dirty, ...cleanRecord } = record;
      this.remote.saveFile(cleanRecord as FileRecord).then(() => {
        // 成功: dirtyクリア
        this.local.clearDirty(record.file_id);
      }).catch(error => {
        console.warn(`[StorageManager] Remote save failed for ${record.file_id}, will retry later:`, error);
        // dirtyのまま保持 → 次回flushDirtyQueueでリトライ
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
   * 一括保存（デュアルライト + ダーティキュー）
   */
  async bulkSave(records: FileRecord[]): Promise<void> {
    // ローカルにdirty付きで保存
    const dirtyRecords = records.map(r => ({ ...r, _dirty: true }));
    await this.local.bulkSave(dirtyRecords);

    if (this._remoteAvailable) {
      // _dirtyを除去して送信
      const cleanRecords = records.map(r => {
        const { _dirty, ...clean } = r;
        return clean as FileRecord;
      });
      this.remote.bulkSave(cleanRecords).then(() => {
        this.local.clearDirtyBatch(records.map(r => r.file_id));
      }).catch(error => {
        console.warn('[StorageManager] Remote bulk save failed, will retry later:', error);
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

  /**
   * ダーティキューをフラッシュ（接続復帰時に呼び出し）
   *
   * IndexedDB内のdirty=trueレコードをBQに再送信する。
   * 成功したレコードはdirtyフラグをクリアする。
   */
  async flushDirtyQueue(): Promise<void> {
    if (this._flushingDirty || !this._remoteAvailable) return;
    this._flushingDirty = true;

    try {
      const dirtyRecords = await this.local.getDirtyRecords();
      if (dirtyRecords.length === 0) {
        console.log('[StorageManager] No dirty records to flush');
        return;
      }

      console.log(`[StorageManager] Flushing ${dirtyRecords.length} dirty records to BQ`);

      const successIds: string[] = [];

      // 直列送信（BQ同時実行制限対策）
      for (const record of dirtyRecords) {
        try {
          const { _dirty, ...cleanRecord } = record;
          await this.remote.saveFile(cleanRecord as FileRecord);
          successIds.push(record.file_id);
        } catch (error) {
          console.warn(`[StorageManager] Dirty flush failed for ${record.file_id}:`, error);
          // 失敗分はdirtyのまま残す
        }
      }

      if (successIds.length > 0) {
        await this.local.clearDirtyBatch(successIds);
        console.log(`[StorageManager] Flushed ${successIds.length}/${dirtyRecords.length} dirty records`);
      }
    } catch (error) {
      console.error('[StorageManager] flushDirtyQueue error:', error);
    } finally {
      this._flushingDirty = false;
    }
  }
}

/** シングルトンインスタンス */
export const storageManager = new StorageManager();
