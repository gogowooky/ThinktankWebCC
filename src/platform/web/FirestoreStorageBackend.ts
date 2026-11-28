/**
 * FirestoreStorageBackend.ts
 *
 * Think の正本を利用者ごとの Firestore コレクションに保存する。
 * Google Drive / ローカル Markdown は正本ではなく、Electron 版で保存に成功した後の
 * best-effort バックアップとしてだけ扱う。
 *
 * 土台（文書の読み書き・バックアップ）は FirestoreDocumentStore.ts、スナップショットは FirestoreSnapshotStore.ts、
 * Firestore の値の変換などは firestoreRest.ts にある。
 */

import { type IStorageBackend, type SavePayload, type ThinkMeta, StorageConflictError } from '../../services/storage/IStorageBackend';
import { FirebaseAuthService } from './FirebaseAuthService';
import { inferCreatedAtFromThinkId, isSafeThinkId } from '../../../shared/vaultFormat';
import { nextVersionTimestamp } from '../../../shared/conflict';
import { searchVaultRecords } from '../../../shared/searchIndex';
import { readThinkListCache, writeThinkListCache } from '../../services/storage/thinkListCache';
import { LIST_CACHE_WRITE_DELAY_MS, TOMBSTONE_EXPIRATION_MS, type FirestoreValue, type FirestoreListResponse, type StoredThinkRecord, type FirestoreThinkRecord, type MarkdownImportResult, utf8Bytes, splitFullContent, getFirebaseProjectId, firestoreErrorMessage } from './firestoreRest';
import { FirestoreSnapshotStore } from './FirestoreSnapshotStore';

export type { FirestoreThinkRecord, ThinkSnapshotRecord, ThinkDiffResult, MarkdownImportResult } from './firestoreRest';
export { FIRESTORE_THINK_MAX_BYTES, TOMBSTONE_EXPIRATION_DAYS, firestoreThinkDocumentBytes } from './firestoreRest';

export class FirestoreStorageBackend extends FirestoreSnapshotStore implements IStorageBackend {
  public async getRecord(id: string): Promise<FirestoreThinkRecord | null> {
    const record = await this.fetchDocument(id);
    return record ? { meta: record.meta, body: record.body } : null;
  }

  private listCacheKey(uid: string): string {
    return `${getFirebaseProjectId()}/${uid}/${this.vaultId}`;
  }

  public async listMetaCached(): Promise<ThinkMeta[] | null> {
    const uid = FirebaseAuthService.getCurrentUser?.()?.uid;
    return uid ? readThinkListCache(this.listCacheKey(uid)) : null;
  }

  public knownMeta(id: string): ThinkMeta | null {
    return this.records.get(id)?.meta ?? null;
  }

  /** 起動直後は一覧の表示と検索が重なるので、全件の取得は同時に1回だけにする */
  public listMeta(): Promise<ThinkMeta[]> {
    this.listInFlight ??= this.fetchList().finally(() => { this.listInFlight = null; });
    return this.listInFlight;
  }

  private async fetchList(): Promise<ThinkMeta[]> {
    const ctx = await this.context();
    const nextRecords = new Map<string, StoredThinkRecord>();
    const deletedIds = new Set<string>();
    let pageToken = '';

    do {
      const url = new URL(ctx.collectionUrl);
      url.searchParams.set('pageSize', '1000');
      url.searchParams.set('showMissing', 'false');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url.toString(), { headers: ctx.authHeaders });
      if (!response.ok) {
        const body = await this.readJson(response);
        throw new Error(
          `Firestore の Think 一覧取得に失敗しました (${firestoreErrorMessage(
            response.status,
            body,
          )})`,
        );
      }
      const page = (await response.json()) as FirestoreListResponse;
      for (const document of page.documents ?? []) {
        const record = await this.hydrateDocument(document);
        if (!record) continue;
        if (record.meta.isDeleted) deletedIds.add(record.meta.thinkid);
        else nextRecords.set(record.meta.thinkid, record);
      }
      pageToken = page.nextPageToken || '';
    } while (pageToken);

    const toMigrate = [...nextRecords.values()].filter((r) => r.needsCategoryMigration);
    if (toMigrate.length > 0) {
      await this.migrateLegacyCategories(ctx, toMigrate);
    }

    this.records = nextRecords;
    this.hasLoadedList = true;
    // G: 上の数千件のbackup書き出しを待つと一覧表示が数十秒遅れるため、表示後に順番に追従させる
    this.backupSync = this.backupSync
      .then(() => this.syncElectronMarkdownBackups(nextRecords, deletedIds))
      .catch((error) => console.warn('[FirestoreStorageBackend] Markdownバックアップの同期に失敗しました', error));
    const metas = [...nextRecords.values()]
      .map((record) => record.meta)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    setTimeout(() => { void writeThinkListCache(this.listCacheKey(ctx.uid), metas); }, LIST_CACHE_WRITE_DELAY_MS);
    return metas;
  }

  private async migrateLegacyCategories(
    ctx: { authHeaders: Record<string, string>; projectId: string; uid: string },
    records: StoredThinkRecord[],
  ): Promise<void> {
    const batchSize = 400;
    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);
      const writes = chunk.map((record) => ({
        update: {
          name:
            `projects/${ctx.projectId}/databases/(default)/documents/users/${ctx.uid}` +
            `/vaults/${this.vaultId}/thinks/${record.meta.thinkid}`,
          fields: { category: { stringValue: record.meta.category } },
        },
        updateMask: { fieldPaths: ['category'] },
      }));
      try {
        await fetch(
          `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
            ctx.projectId,
          )}/databases/(default)/documents:commit`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
            body: JSON.stringify({ writes }),
          },
        );
        for (const r of chunk) r.needsCategoryMigration = false;
      } catch (err) {
        console.warn('[FirestoreStorageBackend] category migration failed:', err);
      }
    }
  }

  public async getBody(id: string): Promise<string | null> {
    // 別PCで更新された本文を古いメモリcacheから返さないよう、開くたびに正本を確認する。
    const record = await this.fetchDocument(id);
    return record?.body ?? null;
  }

  public save(payload: SavePayload): Promise<ThinkMeta> {
    return this.saveRecord(payload);
  }

  private async saveRecord(
    payload: SavePayload,
    importedDates?: { createdAt?: string; updatedAt?: string },
  ): Promise<ThinkMeta> {
    if (!isSafeThinkId(payload.thinkid)) {
      throw new Error(`不正な thinkid です: ${payload.thinkid}`);
    }
    const known = this.reusableRecord(payload);
    if (known) {
      try {
        return await this.commitSave(payload, known, importedDates);
      } catch (error) {
        // 前提の版が古かっただけで本当の衝突とは限らないので、下で読み直して判定する
        if (!(error instanceof StorageConflictError)) throw error;
      }
    }
    const existing = await this.fetchDocument(payload.thinkid, true);
    if (payload.baseUpdatedAt) {
      const currentVersion = existing?.meta.updatedAt ?? '';
      if (!existing || currentVersion !== payload.baseUpdatedAt) {
        throw new StorageConflictError(payload.thinkid, currentVersion);
      }
    }
    return this.commitSave(payload, existing, importedDates);
  }

  /**
   * 直前に読み書きした版なら、本文を読み直さず Firestore の更新時刻を前提条件にして書く。
   * 別の端末が更新していれば Firestore が書き込みを断るので、確認の精度は読み直しと変わらない。
   */
  private reusableRecord(payload: SavePayload): StoredThinkRecord | null {
    const record = this.records.get(payload.thinkid);
    if (!payload.baseUpdatedAt || !record?.firestoreUpdateTime) return null;
    if (record.meta.updatedAt !== payload.baseUpdatedAt) return null;
    return record.meta.isDeleted || record.payloadParts ? null : record;
  }

  private async commitSave(
    payload: SavePayload,
    existing: StoredThinkRecord | null,
    importedDates?: { createdAt?: string; updatedAt?: string },
  ): Promise<ThinkMeta> {
    const { title, body } = splitFullContent(payload.fullContent);
    const updatedAt =
      (!existing && importedDates?.updatedAt) || nextVersionTimestamp(existing?.meta.updatedAt);
    const createdAt =
      existing?.meta.createdAt ||
      importedDates?.createdAt ||
      inferCreatedAtFromThinkId(payload.thinkid, updatedAt);
    const metadata = payload.metadata ?? existing?.meta.metadata ?? {};
    const rawCat = payload.category || existing?.meta.category || 'memo';
    const category = rawCat === 'bundle' ? 'project' : rawCat === 'abstract' ? 'memo' : rawCat;
    const meta: ThinkMeta = {
      thinkid: payload.thinkid,
      category,
      title,
      keywords: payload.keywords ?? existing?.meta.keywords ?? '',
      relatedIds: payload.relatedIds ?? existing?.meta.relatedIds ?? '',
      sizeBytes: utf8Bytes(payload.fullContent),
      isDeleted: false,
      createdAt,
      updatedAt,
      metadata,
    };
    const fields = this.documentFields({ meta, body });
    const firestoreUpdateTime = await this.commitDocument(payload.thinkid, fields, existing, Boolean(payload.baseUpdatedAt));

    this.records.set(payload.thinkid, { meta, body, firestoreUpdateTime });
    await this.writeElectronMarkdownBackup({ meta, body });
    return meta;
  }

  public async delete(id: string): Promise<void> {
    if (!isSafeThinkId(id)) throw new Error(`不正な thinkid です: ${id}`);
    // delete() 契約には期待版がないため、同時更新時だけ最新を読み直して一度再試行する。
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await this.fetchDocument(id, true, true);
      if (!existing) {
        await this.deleteElectronMarkdownBackup(id);
        return;
      }
      if (existing.meta.isDeleted) {
        await this.purgeSnapshots(id, existing.firestoreUpdateTime);
        this.records.delete(id);
        await this.deleteElectronMarkdownBackup(id);
        return;
      }
      const deletedAt = nextVersionTimestamp(existing.meta.updatedAt);
      const deletedAtDate = new Date(deletedAt);
      const expireAtIso = new Date(
        (Number.isNaN(deletedAtDate.getTime()) ? Date.now() : deletedAtDate.getTime()) +
          TOMBSTONE_EXPIRATION_MS,
      ).toISOString();

      // tombstone: 本文やmetadata等の内容を消去し、最小限のメタデータとTTL情報のみ残す
      const tombstoneFields: Record<string, FirestoreValue> = {
        schemaVersion: { integerValue: '1' },
        thinkid: { stringValue: id },
        category: { stringValue: existing.meta.category || 'memo' },
        title: { stringValue: '' },
        body: { stringValue: '' },
        keywords: { stringValue: '' },
        relatedIds: { stringValue: '' },
        metadata: { mapValue: { fields: {} } },
        sizeBytes: { integerValue: '0' },
        isDeleted: { booleanValue: true },
        createdAt: { stringValue: existing.meta.createdAt || deletedAt },
        updatedAt: { stringValue: deletedAt },
        deletedAt: { timestampValue: deletedAt },
        expireAt: { timestampValue: expireAtIso },
      };

      // 分割保存された子ドキュメント（payloadParts）やスナップショットがあればコミットで同時に削除する
      const extraWrites: Array<Record<string, unknown>> = [];
      const ctx = await this.context();
      const documentName = `projects/${ctx.projectId}/databases/(default)/documents/users/${ctx.uid}` +
        `/vaults/${this.vaultId}/thinks/${id}`;
      extraWrites.push({
        delete: `${documentName}/snapshots/current`,
      });
      if (existing.payloadParts) {
        for (let i = 0; i < existing.payloadParts.count; i++) {
          extraWrites.push({
            delete: `${documentName}/payloadParts/${existing.payloadParts.revision}_${i}`,
          });
        }
      }

      let tombstoneTime: string;
      try {
        tombstoneTime = await this.commitDocument(id, tombstoneFields, existing, true, extraWrites);
      } catch (error) {
        if (!(error instanceof StorageConflictError) || attempt > 0) throw error;
        continue;
      }
      this.records.delete(id);
      await this.purgeSnapshots(id, tombstoneTime);
      await this.deleteElectronMarkdownBackup(id);
      return;
    }
  }

  public async search(query: string): Promise<ThinkMeta[]> {
    // Firestoreに全文検索索引は持たせない。一覧ロード済みならその正本snapshotを
    // 再利用し、キー入力のたびに全documentを再読込しない。
    if (!this.hasLoadedList) await this.listMeta();
    return searchVaultRecords(
      [...this.records.values()].map((record) => ({ meta: record.meta, body: record.body })),
      query,
    );
  }

  /** 旧PC版のMarkdown正本を、利用者が明示したときだけFirestoreへ初回移行する。 */
  public async importElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<MarkdownImportResult> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.listMeta) {
      throw new Error('Markdownバックアップを読み込めるPC版で実行してください。');
    }
    const metas = await storage.listMeta();
    const result: MarkdownImportResult = { imported: 0, skipped: 0, failedIds: [], systemSkipped: 0 };
    for (const [index, meta] of metas.entries()) {
      onProgress?.(index, metas.length);
      if (meta.thinkid === '__tt_ui_state__' || meta.thinkid === '__tt_shortcuts__') {
        result.skipped += 1;
        result.systemSkipped = (result.systemSkipped ?? 0) + 1;
        continue;
      }
      if (meta.isDeleted) {
        result.skipped += 1;
        continue;
      }
      try {
        // 既存正本や削除tombstoneは上書きせず、Firestore側を優先する。
        if (await this.fetchDocument(meta.thinkid, true)) {
          result.skipped += 1;
          continue;
        }
        await this.saveFromMarkdownBackup(storage, meta);
        result.imported += 1;
      } catch (error) {
        result.failedIds.push(meta.thinkid);
        console.warn(`[FirestoreStorageBackend] 初回移行に失敗しました (${meta.thinkid})`, error);
      }
    }
    onProgress?.(metas.length, metas.length);
    return result;
  }

  private async saveFromMarkdownBackup(
    storage: NonNullable<NonNullable<Window['electronAPI']>['storage']>,
    meta: ThinkMeta,
  ): Promise<void> {
    const record = storage.getRecord ? await storage.getRecord(meta.thinkid) : null;
    const body = record?.body ?? (await storage.getContent(meta.thinkid)) ?? '';
    const sourceMeta = record?.meta ?? meta;
    await this.saveRecord({
      thinkid: sourceMeta.thinkid,
      category: sourceMeta.category,
      fullContent: body ? `${sourceMeta.title}\n${body}` : sourceMeta.title,
      keywords: sourceMeta.keywords,
      relatedIds: sourceMeta.relatedIds,
      metadata: sourceMeta.metadata,
    }, {
      createdAt: sourceMeta.createdAt,
      updatedAt: sourceMeta.updatedAt,
    });
  }

  /** 一覧を読み直し、削除されていない全 Think を本文付きで返す（ThinkファイルFolder への移行用）。 */
  public async listRecordsForMigration(): Promise<FirestoreThinkRecord[]> {
    await this.listMeta();
    return [...this.records.values()].map((record) => ({ meta: record.meta, body: record.body }));
  }

  /**
   * 移行用。Firestore 側の版（削除済みを含む）より新しいときだけ書き込み、作成・更新日時は移行元の値を保つ。
   * 上書きされる版は書き込み前に beforeOverwrite へ渡す（呼び出し側で退避する）。
   */
  public async importNewerRecord(
    record: FirestoreThinkRecord,
    beforeOverwrite?: (replaced: FirestoreThinkRecord) => Promise<void>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const id = record.meta.thinkid;
    if (!isSafeThinkId(id)) throw new Error(`不正な thinkid です: ${id}`);
    if (!record.meta.updatedAt) throw new Error(`移行元の更新日時がありません: ${id}`);
    const existing = await this.fetchDocument(id, true);
    if (existing && (existing.meta.updatedAt || '') >= record.meta.updatedAt) return 'skipped';
    return this.writeImportedRecord(record, existing, beforeOverwrite);
  }

  /**
   * 上書きコピー用。更新日時に関わらず Firestore の版を置き換える。
   * 更新日時は書き込んだ時刻にする（元の古い日付のままだと、他の端末の一覧キャッシュや
   * バックアップが自分の版のほうが新しいとみなし、上書きが伝わらないため）。作成日時は元の値を保つ。
   */
  public async overwriteRecord(
    record: FirestoreThinkRecord,
    beforeOverwrite?: (replaced: FirestoreThinkRecord) => Promise<void>,
  ): Promise<'created' | 'updated'> {
    const id = record.meta.thinkid;
    if (!isSafeThinkId(id)) throw new Error(`不正な thinkid です: ${id}`);
    const existing = await this.fetchDocument(id, true);
    const updatedAt = new Date().toISOString();
    return this.writeImportedRecord(
      { meta: { ...record.meta, updatedAt }, body: record.body },
      existing,
      beforeOverwrite,
    );
  }

  private async writeImportedRecord(
    record: FirestoreThinkRecord,
    existing: StoredThinkRecord | null,
    beforeOverwrite?: (replaced: FirestoreThinkRecord) => Promise<void>,
  ): Promise<'created' | 'updated'> {
    const id = record.meta.thinkid;
    if (existing && !existing.meta.isDeleted && beforeOverwrite) {
      await beforeOverwrite({ meta: existing.meta, body: existing.body });
    }
    const fullContent = record.body ? `${record.meta.title}\n${record.body}` : record.meta.title;
    const rawCat = record.meta.category || 'memo';
    const meta: ThinkMeta = {
      ...record.meta,
      category: rawCat === 'bundle' ? 'project' : rawCat === 'abstract' ? 'memo' : rawCat,
      keywords: record.meta.keywords || '',
      relatedIds: record.meta.relatedIds || '',
      sizeBytes: utf8Bytes(fullContent),
      isDeleted: false,
      createdAt: record.meta.createdAt || inferCreatedAtFromThinkId(id, record.meta.updatedAt),
      metadata: record.meta.metadata ?? {},
    };
    await this.commitDocument(id, this.documentFields({ meta, body: record.body }), existing, Boolean(existing));
    this.records.set(id, { meta, body: record.body, firestoreUpdateTime: '' });
    await this.writeElectronMarkdownBackup({ meta, body: record.body });
    return existing && !existing.meta.isDeleted ? 'updated' : 'created';
  }

  /** Firestore正本の全データを取得し、PC版のMarkdownバックアップへ一括書き出しする */
  public async exportAllToElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ exported: number; failedIds: string[] }> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.save && !storage?.writeBackup) {
      throw new Error('Markdownバックアップを保存できるPC版で実行してください。');
    }
    const metas = await this.listMeta();
    const result = { exported: 0, failedIds: [] as string[] };
    for (const [index, meta] of metas.entries()) {
      onProgress?.(index, metas.length);
      if (meta.isDeleted) continue;
      try {
        const body = (await this.getBody(meta.thinkid)) ?? '';
        await this.writeElectronMarkdownBackup({ meta, body });
        result.exported += 1;
      } catch (err) {
        result.failedIds.push(meta.thinkid);
        console.warn(`[FirestoreStorageBackend] バックアップ書出しに失敗しました (${meta.thinkid})`, err);
      }
    }
    onProgress?.(metas.length, metas.length);
    return result;
  }

  /** PC版のMarkdownバックアップからFirestoreへ強制的に全件書き戻す（上書き） */
  public async restoreFromElectronMarkdownBackup(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ restored: number; failedIds: string[] }> {
    const storage = typeof window !== 'undefined' ? window.electronAPI?.storage : undefined;
    if (!storage?.listMeta) {
      throw new Error('Markdownバックアップを読み込めるPC版で実行してください。');
    }
    const metas = await storage.listMeta();
    const result = { restored: 0, failedIds: [] as string[] };
    for (const [index, meta] of metas.entries()) {
      onProgress?.(index, metas.length);
      if (meta.thinkid === '__tt_ui_state__' || meta.thinkid === '__tt_shortcuts__' || meta.isDeleted) {
        continue;
      }
      try {
        await this.saveFromMarkdownBackup(storage, meta);
        result.restored += 1;
      } catch (err) {
        result.failedIds.push(meta.thinkid);
        console.warn(`[FirestoreStorageBackend] 書き戻しに失敗しました (${meta.thinkid})`, err);
      }
    }
    onProgress?.(metas.length, metas.length);
    return result;
  }
}
