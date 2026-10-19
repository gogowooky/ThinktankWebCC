/**
 * src/platform/web/DriveApiStorageBackend.ts
 * Web版における Google Drive 直接保存 ＋ 中継役PC読み取り（オフライン時 .thinktank/index シャード合成 & Drive 全文検索フォールバック）バックエンド。
 * システム設計メモ §7・§11 準拠。
 */

import type { IStorageBackend, ThinkMeta, SavePayload } from '../../services/storage/IStorageBackend';
import { StorageConflictError } from '../../services/storage/IStorageBackend';
import {
  parseMdRecord,
  serializeMdRecord,
  parseSupportFile,
  serializeSupportFile,
  toVaultThinkMeta,
  inferCreatedAtFromThinkId,
  hasNonEmptyMetadata,
} from '../../../shared/vaultFormat';
import { verifyNoConflict, nextVersionTimestamp } from '../../../shared/conflict';
import {
  mergeIndexShards,
  mergeBodyPackEntries,
  createIndexShard,
  parseSearchQuery,
  searchVaultRecords,
  type IndexShardV1,
  type BodyPackV1,
} from '../../../shared/searchIndex';
import { GoogleAuthService } from './GoogleAuthService';
import { IndexedDbVaultCache } from './IndexedDbVaultCache';
import { FirestoreRelayClient } from './FirestoreRelayClient';
import { classifyVaultChanges, type DriveChange } from './driveChanges';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_CHANGES_BASE = 'https://www.googleapis.com/drive/v3/changes';
const BODY_PACK_SYNC_TS_KEY = 'tt_drive_body_pack_synced_at';
const WEB_DEVICE_ID_KEY = 'tt_web_device_id';
const CHANGES_PAGE_TOKEN_KEY = 'tt_drive_changes_page_token';
// これより多い変更は1件ずつ取り寄せるより索引から読み直したほうが速い
const MAX_CHANGES_PER_SYNC = 5000;
const MAX_CHANGED_FILES_PER_SYNC = 300;

function loadChangesPageToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(CHANGES_PAGE_TOKEN_KEY) : null;
}

function saveChangesPageToken(token: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CHANGES_PAGE_TOKEN_KEY, token);
}

function clearChangesPageToken(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(CHANGES_PAGE_TOKEN_KEY);
}

function sortByUpdatedDesc(metas: ThinkMeta[]): ThinkMeta[] {
  return metas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function getWebDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'web-default';
  let id = localStorage.getItem(WEB_DEVICE_ID_KEY);
  if (!id) {
    id = `web-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(WEB_DEVICE_ID_KEY, id);
  }
  return id;
}

interface DriveFileItem {
  id: string;
  name: string;
  modifiedTime?: string;
}

export class DriveApiStorageBackend implements IStorageBackend {
  private readonly cache = new IndexedDbVaultCache();
  private bodySyncInProgress = false;
  private subFolderIds: {
    vaultVer2?: string;
    trash?: string;
    index?: string;
  } = {};

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const { accessToken } = GoogleAuthService.getConfig();
    if (!accessToken) {
      throw new Error('Google Drive のアクセストークンが設定されていません。');
    }
    return {
      Authorization: `Bearer ${accessToken}`,
      ...extra,
    };
  }

  public async getCacheStats(): Promise<{
    metaCount: number;
    bodyCount: number;
    lastBodySyncAt: string | null;
    bodySyncInProgress: boolean;
  }> {
    const stats = await this.cache.getStats();
    const lastBodySyncAt =
      typeof localStorage !== 'undefined' ? localStorage.getItem(BODY_PACK_SYNC_TS_KEY) : null;
    return {
      ...stats,
      lastBodySyncAt,
      bodySyncInProgress: this.bodySyncInProgress,
    };
  }

  /** この端末の IndexedDB キャッシュを消し、次の取得で中継役PCまたは Drive から読み直させる。 */
  public async clearCache(): Promise<void> {
    await this.cache.clearAll();
    clearChangesPageToken();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(BODY_PACK_SYNC_TS_KEY);
    }
  }

  private async ensureSubFolders(): Promise<{
    vaultVer2Id: string;
    trashId: string;
    indexId: string;
  }> {
    if (this.subFolderIds.vaultVer2 && this.subFolderIds.trash && this.subFolderIds.index) {
      return {
        vaultVer2Id: this.subFolderIds.vaultVer2,
        trashId: this.subFolderIds.trash,
        indexId: this.subFolderIds.index,
      };
    }
    const { driveRootFolderId } = GoogleAuthService.getConfig();
    if (!driveRootFolderId) {
      throw new Error('Google Drive のルートフォルダID（Thinktank）が設定されていません。');
    }

    const vaultVer2Id = await this.findOrCreateFolder(driveRootFolderId, 'vault_ver2');
    const trashId = await this.findOrCreateFolder(driveRootFolderId, 'trash');
    const dotThinktankId = await this.findOrCreateFolder(driveRootFolderId, '.thinktank');
    const indexId = await this.findOrCreateFolder(dotThinktankId, 'index');

    this.subFolderIds.vaultVer2 = vaultVer2Id;
    this.subFolderIds.trash = trashId;
    this.subFolderIds.index = indexId;
    return { vaultVer2Id, trashId, indexId };
  }

  private async findOrCreateFolder(parentId: string, folderName: string): Promise<string> {
    const q = `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await fetch(
      `${DRIVE_API_BASE}?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers: this.authHeaders() },
    );
    if (res.ok) {
      const data = (await res.json()) as { files?: DriveFileItem[] };
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }
    const createRes = await fetch(DRIVE_API_BASE, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    });
    if (!createRes.ok) {
      throw new Error(`Drive フォルダ「${folderName}」の作成に失敗しました (HTTP ${createRes.status})`);
    }
    const created = (await createRes.json()) as DriveFileItem;
    return created.id;
  }

  private async findFileInFolder(folderId: string, filename: string): Promise<DriveFileItem | null> {
    const q = `'${folderId}' in parents and name = '${filename}' and trashed = false`;
    const res = await fetch(
      `${DRIVE_API_BASE}?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { files?: DriveFileItem[] };
    return data.files && data.files.length > 0 ? data.files[0] : null;
  }

  private async downloadFileText(fileId: string): Promise<string> {
    const res = await fetch(`${DRIVE_API_BASE}/${encodeURIComponent(fileId)}?alt=media`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Drive ファイル取得失敗 (HTTP ${res.status})`);
    }
    return res.text();
  }

  private async uploadFileText(
    folderId: string,
    filename: string,
    mimeType: string,
    content: string,
    existingFileId?: string,
  ): Promise<DriveFileItem> {
    if (existingFileId) {
      const res = await fetch(
        `${DRIVE_UPLOAD_BASE}/${encodeURIComponent(existingFileId)}?uploadType=media&fields=id,name,modifiedTime`,
        {
          method: 'PATCH',
          headers: this.authHeaders({ 'Content-Type': `${mimeType}; charset=utf-8` }),
          body: content,
        },
      );
      if (!res.ok) {
        throw new Error(`Drive ファイル更新失敗 (${filename}: HTTP ${res.status})`);
      }
      return (await res.json()) as DriveFileItem;
    }

    const metadata = { name: filename, parents: [folderId] };
    const boundary = `-------tt_boundary_${Date.now()}`;
    const multipartBody = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}; charset=utf-8`,
      '',
      content,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(
      `${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,modifiedTime`,
      {
        method: 'POST',
        headers: this.authHeaders({
          'Content-Type': `multipart/related; boundary=${boundary}`,
        }),
        body: multipartBody,
      },
    );
    if (!res.ok) {
      throw new Error(`Drive ファイル新規作成失敗 (${filename}: HTTP ${res.status})`);
    }
    return (await res.json()) as DriveFileItem;
  }

  /**
   * バックグラウンドで .thinktank/index/body-pack-*.json を取得して IndexedDB に一括キャッシュする。
   * これにより、中継役PCがオフラインの時でも全件の全文検索が 0.05秒以下で動作する。
   */
  public async syncBodyPacksInBackground(force = false): Promise<number> {
    if (this.bodySyncInProgress || !GoogleAuthService.hasValidToken()) return 0;
    this.bodySyncInProgress = true;
    try {
      const { indexId } = await this.ensureSubFolders();
      const q = `'${indexId}' in parents and name contains 'body-pack-' and trashed = false`;
      const res = await fetch(
        `${DRIVE_API_BASE}?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)`,
        { headers: this.authHeaders() },
      );
      if (!res.ok) return 0;
      const data = (await res.json()) as { files?: DriveFileItem[] };
      const files = data.files ?? [];
      if (files.length === 0) return 0;

      const lastSyncedAt =
        !force && typeof localStorage !== 'undefined'
          ? localStorage.getItem(BODY_PACK_SYNC_TS_KEY)
          : null;
      const stats = await this.cache.getStats();

      // すでに十分な件数がキャッシュされており、かつ新しい body-pack ファイルがなければスキップ
      if (
        !force &&
        lastSyncedAt &&
        stats.bodyCount > 0 &&
        stats.bodyCount >= stats.metaCount * 0.9 &&
        files.every((f) => !f.modifiedTime || f.modifiedTime <= lastSyncedAt)
      ) {
        return stats.bodyCount;
      }

      const packs: BodyPackV1[] = [];
      for (const f of files) {
        try {
          const txt = await this.downloadFileText(f.id);
          packs.push(JSON.parse(txt) as BodyPackV1);
        } catch {
          // 破損パックはスキップ
        }
      }
      if (packs.length === 0) return 0;

      const mergedBodies = mergeBodyPackEntries(packs);
      await this.cache.putBodies(mergedBodies);
      const nowIso = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BODY_PACK_SYNC_TS_KEY, nowIso);
      }
      return Object.keys(mergedBodies).length;
    } catch {
      return 0;
    } finally {
      this.bodySyncInProgress = false;
    }
  }

  /**
   * 索引シャードを作ったあとに PC などで更新された .md を Drive から直接読み、一覧と本文キャッシュを補う。
   * PC 版が索引を書き出すまでの間（または PC 版が動いていない間）も、携帯に最新の版を出すため。
   * 一度に読む件数には上限を設け、残りは次回の一覧取得に回す。
   */
  private async fetchMdNewerThan(sinceIso: string, maxFiles = 100): Promise<ThinkMeta[]> {
    if (!sinceIso) return [];
    try {
      const { vaultVer2Id } = await this.ensureSubFolders();
      const q =
        `'${vaultVer2Id}' in parents and name contains '.md' and ` +
        `modifiedTime > '${sinceIso}' and trashed = false`;
      const res = await fetch(
        `${DRIVE_API_BASE}?q=${encodeURIComponent(q)}&orderBy=modifiedTime desc&pageSize=${maxFiles}&fields=files(id,name,modifiedTime)`,
        { headers: this.authHeaders() },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { files?: DriveFileItem[] };
      const metas: ThinkMeta[] = [];
      for (const f of data.files ?? []) {
        if (!f.name.endsWith('.md')) continue;
        try {
          const parsed = parseMdRecord(await this.downloadFileText(f.id), f.name.slice(0, -3));
          if (parsed.isDeleted) continue;
          metas.push(toVaultThinkMeta(parsed, null));
          await this.cache.putBody(parsed.thinkid, parsed.body, parsed.updatedAt);
        } catch {
          // 読めないファイルは索引の情報のまま使う
        }
      }
      return metas;
    } catch {
      return [];
    }
  }

  /**
   * Web版で変更されたメタデータを Drive 上の .thinktank/index/shard-web-<deviceId>.json に非同期反映する。
   */
  private async updateWebIndexShardInBackground(
    deletedThinkId?: string,
  ): Promise<void> {
    if (!GoogleAuthService.hasValidToken()) return;
    try {
      const { indexId } = await this.ensureSubFolders();
      const deviceId = getWebDeviceId();
      const shardFilename = `shard-${deviceId}.json`;
      const existingShardItem = await this.findFileInFolder(indexId, shardFilename);
      let existingDeletedIds: Record<string, string> = {};
      if (existingShardItem) {
        try {
          const txt = await this.downloadFileText(existingShardItem.id);
          const parsed = JSON.parse(txt) as IndexShardV1;
          existingDeletedIds = parsed.deletedIds ?? {};
        } catch {
          // ignore
        }
      }
      if (deletedThinkId) {
        existingDeletedIds[deletedThinkId] = new Date().toISOString();
      }
      const allMetas = await this.cache.getAllMeta();
      const shard = createIndexShard(deviceId, allMetas, existingDeletedIds);
      await this.uploadFileText(
        indexId,
        shardFilename,
        'application/json',
        JSON.stringify(shard),
        existingShardItem?.id,
      );
    } catch {
      // バックグラウンドシャード更新失敗時は次回に委ねる
    }
  }

  /**
   * 一覧取得：
   * 1. 中継役PCがオンラインなら listDiff で高速差分同期
   * 2. オフラインなら、2 回目以降は Drive の Changes API で前回からの変更だけを当てる
   * 3. 初回（目印が無い・キャッシュが空・変更が多すぎる）は Drive の .thinktank/index/shard-*.json を合成する
   * 4. IndexedDB キャッシュを更新して返し、裏で body-pack-*.json のバックグラウンド同期を開始する
   */
  public async listMeta(): Promise<ThinkMeta[]> {
    const cached = await this.cache.getAllMeta();
    const latestCachedTs = cached.reduce(
      (max, m) => (m.updatedAt > max ? m.updatedAt : max),
      '',
    );

    if (FirestoreRelayClient.isConfigured()) {
      try {
        const res = await FirestoreRelayClient.request<
          { sinceUpdatedAt?: string },
          { updated: ThinkMeta[]; deleted: string[] }
        >('listDiff', { sinceUpdatedAt: latestCachedTs || undefined });
        if (res.ok && res.result) {
          for (const delId of res.result.deleted) {
            await this.cache.removeMeta(delId);
          }
          if (res.result.updated.length > 0) {
            await this.cache.putMetas(res.result.updated);
          }
          void this.syncBodyPacksInBackground(false);
          return this.cache.getAllMeta();
        }
      } catch {
        // 中継役PCオフライン時は Drive 索引シャードへフォールバック
      }
    }

    if (GoogleAuthService.hasValidToken()) {
      try {
        // 2 回目以降は Changes API で「前回から変わったファイル」だけを取り寄せる（PC 版の索引の作り直しを待たない）
        const savedToken = loadChangesPageToken();
        if (savedToken && cached.length > 0 && (await this.applyDriveChanges(savedToken))) {
          void this.syncBodyPacksInBackground(false);
          return sortByUpdatedDesc(await this.cache.getAllMeta());
        }
        // 索引を読む前に目印を取っておく。読んでいる間の変更は次回の Changes API で拾い直せる（同じ変更を二度当てても結果は同じ）
        const startToken = await this.fetchChangesStartToken();
        const fromIndex = await this.loadFromIndexShards();
        if (fromIndex) {
          if (startToken) saveChangesPageToken(startToken);
          return fromIndex;
        }
      } catch {
        // fallback to cached
      }
    }

    return cached;
  }

  /** Drive 上の索引シャードを合成し、索引より新しい .md を補って一覧を作る（初回やキャッシュが空のとき）。 */
  private async loadFromIndexShards(): Promise<ThinkMeta[] | null> {
    const { indexId } = await this.ensureSubFolders();
    const q = `'${indexId}' in parents and name contains 'shard-' and trashed = false`;
    const res = await fetch(
      `${DRIVE_API_BASE}?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { files?: DriveFileItem[] };
    const shards: IndexShardV1[] = [];
    for (const f of data.files ?? []) {
      try {
        const txt = await this.downloadFileText(f.id);
        shards.push(JSON.parse(txt) as IndexShardV1);
      } catch {
        // skip corrupt shard
      }
    }
    if (shards.length === 0) return null;
    const merged = mergeIndexShards(shards);
    const newestShardAt = shards.reduce((max, s) => (s.updatedAt > max ? s.updatedAt : max), '');
    const fresher = await this.fetchMdNewerThan(newestShardAt);
    const byId = new Map<string, ThinkMeta>(merged.map((m) => [m.thinkid, m]));
    for (const m of fresher) byId.set(m.thinkid, m);
    const result = sortByUpdatedDesc([...byId.values()]);
    await this.cache.putMetas(result);
    void this.syncBodyPacksInBackground(false);
    return result;
  }

  private async fetchChangesStartToken(): Promise<string | null> {
    const res = await fetch(`${DRIVE_CHANGES_BASE}/startPageToken`, { headers: this.authHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { startPageToken?: string };
    return data.startPageToken ?? null;
  }

  /**
   * 目印（pageToken）以降の Drive の変更を読み、Vault の .md / .support.json / 削除をキャッシュに当てる。
   * 変更が多すぎる・目印が無効なときは false を返し、呼び出し側に索引からの読み直しを任せる。
   * 取り寄せに失敗したファイルがあれば目印を進めず、次回もう一度当てる。
   */
  private async applyDriveChanges(pageToken: string): Promise<boolean> {
    const { vaultVer2Id, trashId } = await this.ensureSubFolders();
    const changes: DriveChange[] = [];
    let token: string | undefined = pageToken;
    let newStartToken = '';
    while (token) {
      const url =
        `${DRIVE_CHANGES_BASE}?pageToken=${encodeURIComponent(token)}&pageSize=1000` +
        `&includeRemoved=true&spaces=drive` +
        `&fields=${encodeURIComponent('nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,parents,trashed,modifiedTime))')}`;
      const res = await fetch(url, { headers: this.authHeaders() });
      if (!res.ok) {
        if (res.status === 400 || res.status === 404) clearChangesPageToken();
        return false;
      }
      const data = (await res.json()) as {
        nextPageToken?: string;
        newStartPageToken?: string;
        changes?: DriveChange[];
      };
      changes.push(...(data.changes ?? []));
      if (changes.length > MAX_CHANGES_PER_SYNC) {
        clearChangesPageToken();
        return false;
      }
      if (data.newStartPageToken) newStartToken = data.newStartPageToken;
      token = data.nextPageToken;
    }

    const set = classifyVaultChanges(changes, { vaultFolderId: vaultVer2Id, trashFolderId: trashId });
    if (set.mdFiles.length > MAX_CHANGED_FILES_PER_SYNC) {
      clearChangesPageToken();
      return false;
    }

    let failures = 0;
    for (const thinkid of set.removedThinkIds) {
      await this.cache.removeMeta(thinkid);
    }
    for (const { fileId, thinkid } of set.mdFiles) {
      try {
        const parsed = parseMdRecord(await this.downloadFileText(fileId), thinkid);
        if (parsed.isDeleted) {
          await this.cache.removeMeta(thinkid);
          continue;
        }
        await this.cache.putMetas([toVaultThinkMeta(parsed, null)]);
        await this.cache.putBody(thinkid, parsed.body, parsed.updatedAt);
      } catch {
        failures++;
      }
    }
    for (const { fileId, thinkid } of set.supportFiles) {
      try {
        const sup = parseSupportFile(await this.downloadFileText(fileId), thinkid);
        await this.cache.putSupport(thinkid, sup.metadata);
      } catch {
        failures++;
      }
    }

    if (failures === 0 && newStartToken) saveChangesPageToken(newStartToken);
    return true;
  }

  /**
   * 本文取得：一覧の版（updatedAt）と一致する IndexedDB キャッシュ → 中継役PC → Drive 直接取得の順で解決する。
   * どこからも取れないときだけ、版の合わない古いキャッシュを返す。
   */
  public async getBody(id: string): Promise<string | null> {
    const expectedUpdatedAt = (await this.cache.getMeta(id))?.updatedAt;
    const cachedBody = await this.cache.getBody(id, expectedUpdatedAt);
    if (cachedBody !== null) {
      return cachedBody;
    }

    if (FirestoreRelayClient.isConfigured()) {
      try {
        const res = await FirestoreRelayClient.request<
          { thinkid: string },
          { body: string; meta?: ThinkMeta; support?: Record<string, unknown> } | null
        >('getBody', { thinkid: id });
        if (res.ok && res.result) {
          const { body, meta, support } = res.result;
          if (meta) await this.cache.putMetas([meta]);
          await this.cache.putBody(id, body, meta?.updatedAt ?? expectedUpdatedAt);
          if (support) {
            await this.cache.putSupport(id, support);
          }
          return body;
        }
      } catch {
        // Drive 直接取得へフォールバック
      }
    }

    if (GoogleAuthService.hasValidToken()) {
      try {
        const { vaultVer2Id } = await this.ensureSubFolders();
        const fileItem = await this.findFileInFolder(vaultVer2Id, `${id}.md`);
        if (fileItem) {
          const rawMd = await this.downloadFileText(fileItem.id);
          const parsed = parseMdRecord(rawMd, id);
          await this.cache.putBody(id, parsed.body, parsed.updatedAt);
          return parsed.body;
        }
      } catch {
        // IndexedDB キャッシュへフォールバック
      }
    }

    return this.cache.getBody(id);
  }

  private hasDriveFolderConfigured(): boolean {
    return (
      GoogleAuthService.hasValidToken() &&
      Boolean(GoogleAuthService.getConfig().driveRootFolderId)
    );
  }

  /**
   * 保存：Web版は Google Drive API に直接保存し、中継役PCが接続されていれば中継役PC側の Vault にも反映する（システム設計メモ §11.1）。
   * 保存直前に既存ファイルの updated_at と比較し、衝突があれば StorageConflictError を投げる。
   */
  public async save(payload: SavePayload): Promise<ThinkMeta> {
    const thinkid = payload.thinkid;
    let existingRecord = null;
    let existingFileItem: DriveFileItem | null = null;
    let vaultVer2Id = '';

    if (this.hasDriveFolderConfigured()) {
      const folders = await this.ensureSubFolders();
      vaultVer2Id = folders.vaultVer2Id;
      existingFileItem = await this.findFileInFolder(vaultVer2Id, `${thinkid}.md`);
      if (existingFileItem) {
        const rawMd = await this.downloadFileText(existingFileItem.id);
        existingRecord = parseMdRecord(rawMd, thinkid);
      }
    }

    if (payload.baseUpdatedAt && existingRecord) {
      const conflictCheck = verifyNoConflict(
        { exists: true, updatedAt: existingRecord.updatedAt },
        payload.baseUpdatedAt,
      );
      if (!conflictCheck.ok) {
        throw new StorageConflictError(thinkid, conflictCheck.currentUpdatedAt || '');
      }
    }

    const updatedAt = nextVersionTimestamp(existingRecord?.updatedAt);
    const createdAt =
      existingRecord?.createdAt || inferCreatedAtFromThinkId(thinkid, updatedAt);

    const nlIndex = payload.fullContent.indexOf('\n');
    const title =
      nlIndex === -1
        ? payload.fullContent.replace(/\r$/, '')
        : payload.fullContent.slice(0, nlIndex).replace(/\r$/, '');
    const body = nlIndex === -1 ? '' : payload.fullContent.slice(nlIndex + 1);

    const mdContent = serializeMdRecord({
      thinkid,
      category: payload.category || existingRecord?.category || 'memo',
      title,
      keywords: payload.keywords || null,
      relatedIds: payload.relatedIds || null,
      createdAt,
      updatedAt,
      body,
    });

    if (this.hasDriveFolderConfigured() && vaultVer2Id) {
      await this.uploadFileText(
        vaultVer2Id,
        `${thinkid}.md`,
        'text/markdown',
        mdContent,
        existingFileItem?.id,
      );

      if (payload.metadata && hasNonEmptyMetadata(payload.metadata)) {
        const existingSupItem = await this.findFileInFolder(
          vaultVer2Id,
          `${thinkid}.support.json`,
        );
        const supContent = serializeSupportFile({
          thinkid,
          updatedAt,
          metadata: payload.metadata,
        });
        await this.uploadFileText(
          vaultVer2Id,
          `${thinkid}.support.json`,
          'application/json',
          supContent,
          existingSupItem?.id,
        );
      }
    } else if (FirestoreRelayClient.isConfigured()) {
      try {
        await FirestoreRelayClient.request<SavePayload, ThinkMeta>('saveRecord', payload);
      } catch {
        // 中継役PCオフライン時は IndexedDB キャッシュ保存を優先
      }
    }

    const parsed = parseMdRecord(mdContent, thinkid);
    const sup = payload.metadata
      ? parseSupportFile(
          serializeSupportFile({ thinkid, updatedAt, metadata: payload.metadata }),
          thinkid,
        )
      : null;
    const savedMeta = toVaultThinkMeta(parsed, sup);

    await this.cache.putMetas([savedMeta]);
    await this.cache.putBody(thinkid, parsed.body, savedMeta.updatedAt);
    if (payload.metadata) {
      await this.cache.putSupport(thinkid, payload.metadata);
    }
    if (this.hasDriveFolderConfigured()) {
      void this.updateWebIndexShardInBackground();
    }

    return savedMeta;
  }

  /**
   * 削除：物理削除せず Drive の trash/ フォルダへ移動する（システム設計メモ §4.3）。
   */
  public async delete(id: string): Promise<void> {
    if (this.hasDriveFolderConfigured()) {
      const { vaultVer2Id, trashId } = await this.ensureSubFolders();
      for (const filename of [`${id}.md`, `${id}.support.json`]) {
        const item = await this.findFileInFolder(vaultVer2Id, filename);
        if (item) {
          await fetch(
            `${DRIVE_API_BASE}/${encodeURIComponent(item.id)}?addParents=${encodeURIComponent(
              trashId,
            )}&removeParents=${encodeURIComponent(vaultVer2Id)}`,
            {
              method: 'PATCH',
              headers: this.authHeaders(),
            },
          );
        }
      }
    } else if (FirestoreRelayClient.isConfigured()) {
      try {
        await FirestoreRelayClient.request('deleteRecord', { thinkid: id });
      } catch {
        // ignore offline relay error
      }
    }
    await this.cache.removeMeta(id);
    if (this.hasDriveFolderConfigured()) {
      void this.updateWebIndexShardInBackground(id);
    }
  }

  /**
   * Google Drive API の `fullText contains` を使ったクラウド側全文検索フォールバック。
   * 初回起動直後でバックグラウンド本文キャッシュがまだ完了していない場合でも漏れなくヒットさせる。
   */
  private async searchViaDriveFullTextApi(freeTerms: string[]): Promise<Set<string>> {
    const matchedIds = new Set<string>();
    if (freeTerms.length === 0 || !GoogleAuthService.hasValidToken()) {
      return matchedIds;
    }
    try {
      const { vaultVer2Id } = await this.ensureSubFolders();
      const termClauses = freeTerms
        .map((t) => `fullText contains '${t.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
        .join(' and ');
      const q = `'${vaultVer2Id}' in parents and name contains '.md' and (${termClauses}) and trashed = false`;
      const res = await fetch(
        `${DRIVE_API_BASE}?q=${encodeURIComponent(q)}&pageSize=100&fields=files(id,name)`,
        { headers: this.authHeaders() },
      );
      if (res.ok) {
        const data = (await res.json()) as { files?: DriveFileItem[] };
        for (const f of data.files ?? []) {
          if (f.name.endsWith('.md') && !f.name.endsWith('.support.json')) {
            matchedIds.add(f.name.slice(0, -3));
          }
        }
      }
    } catch {
      // Drive fullText 検索失敗時はローカルキャッシュ結果をそのまま使う
    }
    return matchedIds;
  }

  /**
   * 検索：
   * 1. 中継役PCがオンラインなら中継役PCで全文検索（本文のみ＋フィールド指定）
   * 2. オフラインなら IndexedDB の一括本文キャッシュ（getAllBodies: 1トランザクション・約10〜30ms）で高速全文検索
   * 3. 初回起動直後等で本文キャッシュが未完了の場合は、Google Drive API の `fullText contains` 検索も併用してマージする
   */
  public async search(query: string): Promise<ThinkMeta[]> {
    if (FirestoreRelayClient.isConfigured()) {
      try {
        const res = await FirestoreRelayClient.request<{ query: string }, ThinkMeta[]>(
          'search',
          { query },
        );
        if (res.ok && Array.isArray(res.result)) {
          return res.result;
        }
      } catch {
        // オフライン高速検索へフォールバック
      }
    }

    const [metas, bodyMap] = await Promise.all([
      this.cache.getAllMeta(),
      this.cache.getAllBodies(),
    ]);

    // 版の合わない古い本文で検索すると、今の内容にない語で当たってしまうので使わない
    const currentBody = (meta: ThinkMeta): string => {
      const cached = bodyMap[meta.thinkid];
      return cached && cached.updatedAt === meta.updatedAt ? cached.body : '';
    };
    const searchable = metas.map((meta) => ({
      meta,
      body: currentBody(meta),
    }));

    const localMatched = searchVaultRecords(searchable, query);

    // もし本文キャッシュがまだ十分に揃っておらず自由語検索がある場合は、Drive API 全文検索も併用
    const parsedQuery = parseSearchQuery(query);
    const cachedBodyCount = searchable.filter((s) => s.body !== '').length;
    if (
      parsedQuery.freeTerms.length > 0 &&
      cachedBodyCount < metas.length * 0.8 &&
      GoogleAuthService.hasValidToken()
    ) {
      void this.syncBodyPacksInBackground(false);
      const driveHitIds = await this.searchViaDriveFullTextApi(parsedQuery.freeTerms);
      if (driveHitIds.size > 0) {
        const seen = new Set(localMatched.map((m) => m.thinkid));
        const metaById = new Map(metas.map((m) => [m.thinkid, m]));
        for (const hitId of driveHitIds) {
          if (!seen.has(hitId)) {
            const m = metaById.get(hitId);
            if (m && !m.isDeleted) {
              localMatched.push(m);
              seen.add(hitId);
            }
          }
        }
      }
    }

    return localMatched;
  }
}

