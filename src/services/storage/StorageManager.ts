/**
 * StorageManager.ts
 * ストレージバックエンドのシングルトン管理クラス
 *
 * Electron / Web とも Think の正本は Firestore。
 * Electron のローカル Markdown は FirestoreStorageBackend が保存成功後に
 * best-effort で書き出すバックアップであり、読み取り元にはしない。
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from './IStorageBackend';
import type { DriveApiStorageBackend } from '../../platform/web/DriveApiStorageBackend';
import { ElectronStorageBackend } from './ElectronStorageBackend';
import {
  FirestoreStorageBackend,
  type MarkdownImportResult,
  type FirestoreThinkRecord,
  type ThinkSnapshotRecord,
  type ThinkDiffResult,
} from '../../platform/web/FirestoreStorageBackend';

export type { ThinkSnapshotRecord, ThinkDiffResult };

export class StorageManager {
  private static _instance: StorageManager | null = null;

  public backend: IStorageBackend;
  public readonly mode: 'electron' | 'pwa';
  public webProvider: 'drive' | 'local' = 'local';

  private constructor() {
    this.mode =
      typeof window !== 'undefined' && window.electronAPI ? 'electron' : 'pwa';
    // relay APIを持たない旧preloadは移行前クライアント（および単体テスト）として
    // ローカル保存を維持する。現行ElectronとWebの正本は必ずFirestore。
    this.backend =
      this.mode === 'electron' && !window.electronAPI?.relay
        ? new ElectronStorageBackend()
        : new FirestoreStorageBackend();
    console.log(
      `[StorageManager] mode=${this.mode} (${this.backend instanceof FirestoreStorageBackend ? 'Firestore canonical storage' : 'legacy IPC storage'})`,
    );
  }

  public static get instance(): StorageManager {
    if (!StorageManager._instance) {
      StorageManager._instance = new StorageManager();
    }
    return StorageManager._instance;
  }

  /**
   * 旧設定画面との一時的な互換API。Think の保存先は切り替えず、常に Firestore。
   */
  public setWebProvider(provider: 'drive' | 'local'): void {
    this.webProvider = provider;
  }

  public getDriveBackend(): DriveApiStorageBackend | null {
    return null;
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

  public importElectronMarkdownBackup(): Promise<MarkdownImportResult> {
    if (!(this.backend instanceof FirestoreStorageBackend)) {
      throw new Error('Firestore正本を使用する現行PC版で実行してください。');
    }
    return this.backend.importElectronMarkdownBackup();
  }

  public exportAllToElectronMarkdownBackup(): Promise<{ exported: number; failedIds: string[] }> {
    if (!(this.backend instanceof FirestoreStorageBackend)) {
      throw new Error('Firestore正本を使用する現行PC版で実行してください。');
    }
    return this.backend.exportAllToElectronMarkdownBackup();
  }

  public restoreFromElectronMarkdownBackup(): Promise<{ restored: number; failedIds: string[] }> {
    if (!(this.backend instanceof FirestoreStorageBackend)) {
      throw new Error('Firestore正本を使用する現行PC版で実行してください。');
    }
    return this.backend.restoreFromElectronMarkdownBackup();
  }

  // ── スナップショット機能 ──────────────────────────────────────────

  public createSnapshot(thinkid: string): Promise<ThinkSnapshotRecord> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.createSnapshot(thinkid);
    }
    throw new Error('スナップショット機能は Firestore ストレージでのみ利用可能です。');
  }

  public getSnapshot(thinkid: string): Promise<ThinkSnapshotRecord | null> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.getSnapshot(thinkid);
    }
    return Promise.resolve(null);
  }

  public deleteSnapshot(thinkid: string): Promise<void> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.deleteSnapshot(thinkid);
    }
    return Promise.resolve();
  }

  public getDiff(thinkid: string): Promise<ThinkDiffResult | null> {
    if (this.backend instanceof FirestoreStorageBackend) {
      return this.backend.getDiff(thinkid);
    }
    return Promise.resolve(null);
  }
}

