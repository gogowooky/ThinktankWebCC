/**
 * StorageManager.ts
 * ストレージバックエンドのシングルトン管理クラス
 *
 * Think の正本は通常 Firestore。Electron のローカル Markdown は FirestoreStorageBackend が
 * 保存成功後に best-effort で書き出すバックアップであり、読み取り元にはしない。
 * PC版のローカル運用モードだけは、ThinkファイルFolder の .md を IPC 経由で正本とする。
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import { ElectronStorageBackend } from './ElectronStorageBackend';
import {
  FirestoreStorageBackend,
  type MarkdownImportResult,
  type FirestoreThinkRecord,
  type ThinkSnapshotRecord,
  type ThinkDiffResult,
} from '../../platform/web/FirestoreStorageBackend';
import { currentStorageMode, type StorageMode } from './storageMode';
import { copyFirestoreToLocal, copyLocalToFirestore, type VaultMigrationResult } from './vaultMigration';

export type { ThinkSnapshotRecord, ThinkDiffResult, VaultMigrationResult };

export class StorageManager {
  private static _instance: StorageManager | null = null;

  public backend: IStorageBackend;
  public readonly mode: 'electron' | 'pwa';
  public readonly storageMode: StorageMode;

  private constructor() {
    this.mode =
      typeof window !== 'undefined' && window.electronAPI ? 'electron' : 'pwa';
    this.storageMode = currentStorageMode();
    // relay APIを持たない旧preloadは移行前クライアント（および単体テスト）として
    // ローカル保存を維持する。
    this.backend =
      this.mode === 'electron' && (this.storageMode === 'local' || !window.electronAPI?.relay)
        ? new ElectronStorageBackend()
        : new FirestoreStorageBackend();
    console.log(
      `[StorageManager] mode=${this.mode} (${this.backend instanceof FirestoreStorageBackend ? 'Firestore canonical storage' : this.storageMode === 'local' ? 'local folder storage' : 'legacy IPC storage'})`,
    );
  }

  private get localSnapshotApi() {
    return typeof window !== 'undefined' ? window.electronAPI?.snapshot : undefined;
  }

  private requireFirestore(action: string): FirestoreStorageBackend {
    if (!(this.backend instanceof FirestoreStorageBackend)) {
      throw new Error(`${action}は「Firestore で使う」モードで実行してください。`);
    }
    return this.backend;
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

  public async listMetaCached(): Promise<ThinkMeta[] | null> {
    return (await this.backend.listMetaCached?.()) ?? null;
  }

  public knownMeta(id: string): ThinkMeta | null {
    return this.backend.knownMeta?.(id) ?? null;
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

  /** 本文とメタデータを同じ正本版として取得する（各サービスの部分更新用）。 */
  public getRecord(id: string): Promise<FirestoreThinkRecord | null> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.getRecord(id);
    }
    const direct =
      typeof window !== 'undefined' ? window.electronAPI?.storage?.getRecord : undefined;
    if (direct) {
      return direct(id).then((record) =>
        record ? { meta: record.meta, body: record.body } : null,
      );
    }
    return Promise.all([this.backend.listMeta(), this.backend.getBody(id)]).then(
      ([metas, body]) => {
        const meta = metas.find((item) => item.thinkid === id);
        return meta && body !== null ? { meta, body } : null;
      },
    );
  }

  /**
   * 本文を変えずにメタデータを部分更新する。現行クライアントではFirestoreの
   * 楽観ロック付きsaveへ統合し、旧preloadだけはsaveSupport IPCへ委譲する。
   */
  public async updateMetadata(
    id: string,
    patch: Record<string, unknown>,
    expectedVersion?: string,
  ): Promise<ThinkMeta> {
    const record = await this.getRecord(id);
    if (!record) throw new Error(`保存対象「${id}」が見つかりません。`);

    if (!(this.backend instanceof FirestoreStorageBackend)) {
      const direct =
        typeof window !== 'undefined' ? window.electronAPI?.storage?.saveSupport : undefined;
      if (direct) {
        const saved = await direct(id, patch, expectedVersion);
        return {
          ...record.meta,
          updatedAt: saved.updatedAt,
          metadata: saved.metadata,
        };
      }
    }

    const metadata = { ...(record.meta.metadata ?? {}), ...patch };
    const fullContent = record.body
      ? `${record.meta.title}\n${record.body}`
      : record.meta.title;
    return this.save({
      thinkid: record.meta.thinkid,
      category: record.meta.category,
      fullContent,
      keywords: record.meta.keywords,
      relatedIds: record.meta.relatedIds,
      metadata,
      baseUpdatedAt: expectedVersion || record.meta.updatedAt || undefined,
    });
  }

  public importElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<MarkdownImportResult> {
    if (!(this.backend instanceof FirestoreStorageBackend)) {
      throw new Error('Firestore正本を使用する現行PC版で実行してください。');
    }
    return this.backend.importElectronMarkdownBackup(onProgress);
  }

  public exportAllToElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ exported: number; failedIds: string[] }> {
    if (!(this.backend instanceof FirestoreStorageBackend)) {
      throw new Error('Firestore正本を使用する現行PC版で実行してください。');
    }
    return this.backend.exportAllToElectronMarkdownBackup(onProgress);
  }

  public restoreFromElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ restored: number; failedIds: string[] }> {
    if (!(this.backend instanceof FirestoreStorageBackend)) {
      throw new Error('Firestore正本を使用する現行PC版で実行してください。');
    }
    return this.backend.restoreFromElectronMarkdownBackup(onProgress);
  }

  // ── Firestore ⇔ ThinkファイルFolder の移行（最新を残す） ─────────────────

  public copyFirestoreToLocal(
    localVaultDir: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<VaultMigrationResult> {
    return copyFirestoreToLocal(this.requireFirestore('ThinkファイルFolder への移行'), localVaultDir, onProgress);
  }

  public copyLocalToFirestore(
    localVaultDir: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<VaultMigrationResult> {
    return copyLocalToFirestore(this.requireFirestore('Firestore への移行'), localVaultDir, onProgress);
  }

  // ── スナップショット機能 ──────────────────────────────────────────

  public createSnapshot(thinkid: string): Promise<ThinkSnapshotRecord> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.createSnapshot(thinkid);
    }
    const local = this.localSnapshotApi;
    if (this.storageMode === 'local' && local) return local.create(thinkid);
    throw new Error('スナップショット機能は Firestore ストレージでのみ利用可能です。');
  }

  public getSnapshot(thinkid: string): Promise<ThinkSnapshotRecord | null> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.getSnapshot(thinkid);
    }
    const local = this.localSnapshotApi;
    if (this.storageMode === 'local' && local) return local.get(thinkid);
    return Promise.resolve(null);
  }

  /** スナップショットを古い順にすべて返す */
  public listSnapshots(thinkid: string): Promise<ThinkSnapshotRecord[]> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.listSnapshots(thinkid);
    }
    const local = this.localSnapshotApi;
    if (this.storageMode === 'local' && local) return local.list(thinkid);
    return Promise.resolve([]);
  }

  public deleteSnapshot(thinkid: string): Promise<void> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.deleteSnapshot(thinkid);
    }
    const local = this.localSnapshotApi;
    if (this.storageMode === 'local' && local) return local.delete(thinkid);
    return Promise.resolve();
  }

  public async getDiff(thinkid: string): Promise<ThinkDiffResult | null> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.getDiff(thinkid);
    }
    if (this.storageMode !== 'local') return null;
    const [latest, snapshot] = await Promise.all([this.getRecord(thinkid), this.getSnapshot(thinkid)]);
    if (!latest || latest.meta.isDeleted || !snapshot) return null;
    const latestMetadata = latest.meta.metadata ?? {};
    const titleChanged = latest.meta.title !== snapshot.title;
    const bodyChanged = latest.body !== snapshot.body;
    const metadataChanged = JSON.stringify(latestMetadata) !== JSON.stringify(snapshot.metadata ?? {});
    return {
      thinkid,
      hasChanges: titleChanged || bodyChanged || metadataChanged,
      titleChanged,
      bodyChanged,
      metadataChanged,
      latest: { title: latest.meta.title, body: latest.body, metadata: latestMetadata, updatedAt: latest.meta.updatedAt },
      snapshot,
    };
  }
}

