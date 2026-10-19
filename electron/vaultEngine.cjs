'use strict';

/**
 * electron/vaultEngine.cjs
 * Firestore正本の復旧用Markdownバックアップ（形式バージョン1）とローカル索引を扱うエンジン。
 * - vault_ver2/<thinkid>.md（基本項目のみ）と <thinkid>.support.json（思考支援・業務管理メタデータ）の分離管理
 * - 削除時の trash/ 移動
 * - 楽観ロック（expectedVersion）検証と単調増加タイムスタンプ
 * - 端末別シャード索引 (.thinktank/index/shard-<deviceId>.json) の更新
 * - Drive for desktop 衝突コピーの検出
 * - .thinktank/prompts/ のドメインプロファイル管理
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const shared = require('./shared-dist/index.js');

function hostnameToken() {
  return os.hostname().replace(/[^A-Za-z0-9_-]/g, '_');
}

class VaultEngine {
  /**
   * @param {{ userDataDir: string, appRootDir: string, defaultVaultDir: string, deviceIdPrefix?: string }} options
   * deviceIdPrefix は起動するプログラムの種類（Electron 版は 'pc'、常駐エージェントは 'agent'）。
   */
  constructor({ userDataDir, appRootDir, defaultVaultDir, deviceIdPrefix = 'pc', autoIndexRefresh = false }) {
    this.userDataDir = userDataDir;
    this.appRootDir = appRootDir;
    this.deviceIdPrefix = deviceIdPrefix;
    this.autoIndexRefresh = autoIndexRefresh;
    this._shardTimer = null;
    this._bodyPackTimer = null;
    this._fullIndexPromise = null;
    this.configFilePath = path.join(userDataDir, 'vault-engine-config.json');
    this.overlayFilePath = path.join(userDataDir, 'vault-meta-overlay.json');
    this.config = this._loadConfig(defaultVaultDir);
    this._metaMap = null;
    this._bodyMap = null;
    this._cachedVaultDir = null;
    this._ensureDirs();
  }

  _invalidateCache() {
    this._metaMap = null;
    this._bodyMap = null;
    this._cachedVaultDir = null;
  }

  _loadOverlay() {
    if (!fs.existsSync(this.overlayFilePath)) {
      return { updated: {}, deleted: {} };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.overlayFilePath, 'utf8'));
      return {
        updated: parsed && typeof parsed.updated === 'object' ? parsed.updated : {},
        deleted: parsed && typeof parsed.deleted === 'object' ? parsed.deleted : {},
      };
    } catch {
      return { updated: {}, deleted: {} };
    }
  }

  _saveOverlay(overlay) {
    try {
      this._atomicWrite(this.overlayFilePath, JSON.stringify(overlay) + '\n');
    } catch {
      // ignore
    }
  }

  _recordOverlayUpdate(meta, body) {
    if (this._metaMap) {
      this._metaMap.set(meta.thinkid, meta);
    }
    if (this._bodyMap && typeof body === 'string') {
      this._bodyMap.set(meta.thinkid, body);
    }
    const overlay = this._loadOverlay();
    overlay.updated[meta.thinkid] = meta;
    delete overlay.deleted[meta.thinkid];
    this._saveOverlay(overlay);
    this.scheduleIndexRefresh();
  }

  _recordOverlayDelete(thinkid) {
    if (this._metaMap) {
      this._metaMap.delete(thinkid);
    }
    if (this._bodyMap) {
      this._bodyMap.delete(thinkid);
    }
    const overlay = this._loadOverlay();
    delete overlay.updated[thinkid];
    overlay.deleted[thinkid] = new Date().toISOString();
    this._saveOverlay(overlay);
    this.scheduleIndexRefresh();
  }

  /**
   * Web 版は中継役がいないとき Drive 上の索引を読むので、保存のたびに索引を作り直さないと
   * 携帯に古い一覧が出る。索引（約 1.5MB）は保存が落ち着いてから、本文パック（約 24MB）は
   * Drive への送信量を抑えるため間隔を空けて書き出す。
   */
  scheduleIndexRefresh({ shardDelayMs = 15_000, bodyPackDelayMs = 30 * 60_000 } = {}) {
    if (!this.autoIndexRefresh) return;
    if (this._shardTimer) clearTimeout(this._shardTimer);
    this._shardTimer = setTimeout(() => {
      this._shardTimer = null;
      this._writeIndexSafely({ includeBodyPack: false });
    }, shardDelayMs);
    this._shardTimer.unref?.();
    if (!this._bodyPackTimer) {
      this._bodyPackTimer = setTimeout(() => {
        this._bodyPackTimer = null;
        this._writeIndexSafely({ includeBodyPack: true });
      }, bodyPackDelayMs);
      this._bodyPackTimer.unref?.();
    }
  }

  /** 索引シャードは一覧を作るたびに読むので、ファイルが変わっていなければ前回の解釈結果を使う。 */
  _readShardCached(filePath) {
    if (!this._shardCache) this._shardCache = new Map();
    try {
      const st = fs.statSync(filePath);
      const hit = this._shardCache.get(filePath);
      if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.data;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      this._shardCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, data });
      return data;
    } catch {
      return null;
    }
  }

  stopIndexRefresh() {
    if (this._shardTimer) clearTimeout(this._shardTimer);
    if (this._bodyPackTimer) clearTimeout(this._bodyPackTimer);
    this._shardTimer = null;
    this._bodyPackTimer = null;
  }

  _writeIndexSafely(options) {
    try {
      this.writeDeviceShard(options);
    } catch (err) {
      console.warn(`[Vault] 索引の書き出しに失敗しました: ${err.message || err}`);
    }
  }

  _loadConfig(defaultVaultDir) {
    const base = {
      vaultDir: defaultVaultDir,
      deviceId: '',
      preferredCli: 'claude',
      preferredModel: '',
      activeProfileId: shared.DEFAULT_DOMAIN_PROFILE_ID,
    };
    let config = base;
    if (fs.existsSync(this.configFilePath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
        config = { ...base, ...loaded };
      } catch {
        config = base;
      }
    }
    if (this._needsNewDeviceId(config.deviceId)) {
      config.deviceId = this._generateDeviceId();
      this._writeConfigFile(config);
    }
    return config;
  }

  /**
   * 以前は PC 名だけから `pc_<PC名>` を作っていたため、同じ PC の Electron 版と常駐エージェントが
   * 同じ id になり、索引シャードの上書きや中継の二重処理が起きていた。
   * 既存の Electron 版の id は Web 版の宛先設定が参照しているので残し、それ以外の種類で旧形式なら作り直す。
   */
  _needsNewDeviceId(deviceId) {
    if (typeof deviceId !== 'string' || !deviceId.trim()) return true;
    const legacyId = `pc_${hostnameToken()}`;
    return deviceId === legacyId && this.deviceIdPrefix !== 'pc';
  }

  _generateDeviceId() {
    return `${this.deviceIdPrefix}_${hostnameToken()}_${crypto.randomBytes(3).toString('hex')}`;
  }

  _writeConfigFile(config) {
    try {
      fs.mkdirSync(path.dirname(this.configFilePath), { recursive: true });
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    } catch {
      // 書けなくても今回の起動はメモリ上の id で動ける
    }
  }

  saveConfig(partial) {
    const prevVaultDir = this.getVaultDir();
    this.config = { ...this.config, ...partial };
    if (this._needsNewDeviceId(this.config.deviceId)) {
      this.config.deviceId = this._generateDeviceId();
    }
    fs.mkdirSync(path.dirname(this.configFilePath), { recursive: true });
    fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2) + '\n', 'utf8');
    this._ensureDirs();
    if (this.getVaultDir() !== prevVaultDir) {
      this._invalidateCache();
    }
    return this.getConfig();
  }

  getConfig() {
    return {
      ...this.config,
      vaultRootDir: this.getVaultRootDir(),
      trashDir: this.getTrashDir(),
      indexDir: this.getIndexDir(),
      promptsDir: this.getPromptsDir(),
    };
  }

  /**
   * vaultDir が .../vault_ver2 を指している場合はその親を VaultRoot とみなし、
   * そうでない場合は vaultDir 直下に vault_ver2 がある場合はそれを使う。
   */
  getVaultDir() {
    const configured = this.config.vaultDir;
    if (path.basename(configured) === 'vault_ver2') {
      return configured;
    }
    const sub = path.join(configured, 'vault_ver2');
    if (fs.existsSync(sub)) {
      return sub;
    }
    return configured;
  }

  getVaultRootDir() {
    const vDir = this.getVaultDir();
    return path.basename(vDir) === 'vault_ver2' ? path.dirname(vDir) : vDir;
  }

  getTrashDir() {
    return path.join(this.getVaultRootDir(), 'trash');
  }

  getIndexDir() {
    return path.join(this.getVaultRootDir(), '.thinktank', 'index');
  }

  getPromptsDir() {
    const vaultPrompts = path.join(this.getVaultRootDir(), '.thinktank', 'prompts');
    if (fs.existsSync(vaultPrompts)) {
      return vaultPrompts;
    }
    return path.join(this.appRootDir, '.thinktank', 'prompts');
  }

  _ensureDirs() {
    fs.mkdirSync(this.getVaultDir(), { recursive: true });
    fs.mkdirSync(this.getTrashDir(), { recursive: true });
    fs.mkdirSync(this.getIndexDir(), { recursive: true });
  }

  _mdPath(thinkid) {
    if (!shared.isSafeThinkId(thinkid)) {
      throw new Error(`不正な thinkid です: ${thinkid}`);
    }
    return path.join(this.getVaultDir(), `${thinkid}.md`);
  }

  _supportPath(thinkid) {
    if (!shared.isSafeThinkId(thinkid)) {
      throw new Error(`不正な thinkid です: ${thinkid}`);
    }
    return path.join(this.getVaultDir(), `${thinkid}.support.json`);
  }

  _legacyJsonPath(thinkid) {
    return path.join(this.getVaultDir(), `${thinkid}.json`);
  }

  _atomicWrite(targetPath, content) {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = path.join(
      dir,
      `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`,
    );
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, targetPath);
  }

  /**
   * 1件の .support.json（または旧 .json / 旧 frontmatter 内 metadata）を読み取る。
   */
  readSupportMetadata(thinkid, fallbackRecord) {
    const supPath = this._supportPath(thinkid);
    if (fs.existsSync(supPath)) {
      try {
        const sup = shared.parseSupportFile(fs.readFileSync(supPath, 'utf8'), thinkid);
        return sup;
      } catch (e) {
        console.warn(`[VaultEngine] support.json parse warning (${thinkid}):`, e.message);
      }
    }
    // 旧形式の <thinkid>.json がある場合の後方互換読み取り
    const legPath = this._legacyJsonPath(thinkid);
    if (fs.existsSync(legPath)) {
      try {
        const legObj = JSON.parse(fs.readFileSync(legPath, 'utf8'));
        const metaObj =
          legObj && typeof legObj.metadata === 'object' && legObj.metadata !== null
            ? legObj.metadata
            : legObj && typeof legObj === 'object'
              ? legObj
              : {};
        return {
          schemaVersion: 1,
          thinkid,
          updatedAt: legObj.updated_at || legObj.updatedAt || '',
          metadata: metaObj,
        };
      } catch {
        // ignore
      }
    }
    if (
      fallbackRecord &&
      fallbackRecord.legacyEmbeddedMetadata &&
      Object.keys(fallbackRecord.legacyEmbeddedMetadata).length > 0
    ) {
      return {
        schemaVersion: 1,
        thinkid,
        updatedAt: fallbackRecord.updatedAt,
        metadata: fallbackRecord.legacyEmbeddedMetadata,
      };
    }
    return null;
  }

  /**
   * Vault 内の全有効レコードのメタデータ一覧を返す。
   * .thinktank/index/shard-*.json と差分オーバーレイ、インメモリキャッシュを併用し、
   * Google Drive 仮想ドライブ上の数千ファイルに対する毎回の同期 I/O を回避する。
   */
  listMeta() {
    const vDir = this.getVaultDir();
    if (!fs.existsSync(vDir)) return [];

    const files = fs.readdirSync(vDir);
    const mdIds = [];
    const supSet = new Set();
    const legSet = new Set();
    for (const f of files) {
      if (f.endsWith('.support.json')) {
        supSet.add(f.slice(0, -13));
      } else if (f.endsWith('.json')) {
        legSet.add(f.slice(0, -5));
      } else if (f.endsWith('.md') && !shared.parseDriveConflictFilename(f)) {
        mdIds.push(f.slice(0, -3));
      }
    }

    const indexDir = this.getIndexDir();
    const shardMap = new Map();
    if (fs.existsSync(indexDir)) {
      try {
        const shardFiles = fs
          .readdirSync(indexDir)
          .filter((f) => f.startsWith('shard-') && f.endsWith('.json'));
        if (shardFiles.length > 0) {
          const shards = [];
          for (const sf of shardFiles) {
            const shard = this._readShardCached(path.join(indexDir, sf));
            if (shard) shards.push(shard);
          }
          for (const m of shared.mergeIndexShards(shards)) {
            shardMap.set(m.thinkid, m);
          }
        }
      } catch {
        // ignore index read error
      }
    }

    // 手元の記録（overlay）はこの PC で読んだ・書いた版。携帯の Web 版や別の PC が更新すると、
    // その端末の索引シャードのほうが新しくなるので、そのときはファイルを読み直す。
    // （以前は overlay が常にシャードより優先され、他の端末での更新に気づかなかった）
    // G: の全ファイルの更新時刻を調べると数秒かかるため、シャードとの比較で読み直す対象を絞る。
    const overlay = this._loadOverlay();

    const metaMap = new Map();
    let overlayDirty = false;
    for (const id of mdIds) {
      const hasExternalSupport = supSet.has(id) || legSet.has(id);
      const ownMeta = overlay.updated[id] && typeof overlay.updated[id] === 'object' ? overlay.updated[id] : null;
      const shardMeta = shardMap.get(id);
      const changedElsewhere =
        ownMeta && shardMeta && (shardMeta.updatedAt || '') > (ownMeta.updatedAt || '');
      const cachedMeta = changedElsewhere ? null : ownMeta || shardMeta;
      if (cachedMeta && (!hasExternalSupport || cachedMeta.metadata)) {
        metaMap.set(id, cachedMeta);
        continue;
      }
      try {
        const raw = fs.readFileSync(path.join(vDir, `${id}.md`), 'utf8');
        const parsed = shared.parseMdRecord(raw, id);
        if (parsed.isDeleted) continue;
        const support = hasExternalSupport || parsed.legacyEmbeddedMetadata
          ? this.readSupportMetadata(parsed.thinkid, parsed)
          : null;
        const meta = shared.toVaultThinkMeta(parsed, support);
        metaMap.set(meta.thinkid, meta);
        if (this._bodyMap) this._bodyMap.set(meta.thinkid, parsed.body);
        overlay.updated[meta.thinkid] = meta;
        overlayDirty = true;
      } catch (e) {
        console.warn(`[VaultEngine] listMeta skip ${id}.md:`, e.message);
      }
    }
    if (overlayDirty) {
      this._saveOverlay(overlay);
    }

    this._metaMap = metaMap;
    this._cachedVaultDir = vDir;

    const metas = Array.from(metaMap.values());
    metas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return metas;
  }

  /**
   * Google Drive for desktop が生成した衝突コピーファイル一覧を検出する。
   */
  listConflictFiles() {
    const vDir = this.getVaultDir();
    if (!fs.existsSync(vDir)) return [];
    const conflicts = [];
    for (const f of fs.readdirSync(vDir)) {
      const info = shared.parseDriveConflictFilename(f);
      if (info) {
        const stat = fs.statSync(path.join(vDir, f));
        conflicts.push({
          ...info,
          sizeBytes: stat.size,
          mtimeIso: stat.mtime.toISOString(),
        });
      }
    }
    return conflicts;
  }

  /**
   * 指定 thinkid の本文（タイトル行を含まない body）を返す。
   */
  getContent(thinkid) {
    const p = this._mdPath(thinkid);
    if (!fs.existsSync(p)) return null;
    try {
      const parsed = shared.parseMdRecord(fs.readFileSync(p, 'utf8'), thinkid);
      return parsed.body ?? '';
    } catch {
      return null;
    }
  }

  /**
   * 指定 thinkid のレコード全体（meta + body + support）を取得する。
   */
  getRecord(thinkid) {
    const p = this._mdPath(thinkid);
    if (!fs.existsSync(p)) return null;
    try {
      const parsed = shared.parseMdRecord(fs.readFileSync(p, 'utf8'), thinkid);
      const support = this.readSupportMetadata(thinkid, parsed);
      const meta = shared.toVaultThinkMeta(parsed, support);
      return {
        meta,
        body: parsed.body,
        support: support?.metadata ?? {},
        updatedAt: parsed.updatedAt,
      };
    } catch {
      return null;
    }
  }

  /**
   * レコード（.md と必要に応じて .support.json）を保存する。
   * expectedVersion が指定されている場合は楽観ロック検証を行う。
   */
  saveRecord(payload) {
    const thinkid = String(payload.thinkid ?? payload.id ?? '');
    if (!shared.isSafeThinkId(thinkid)) {
      throw new Error(`不正な thinkid です: ${thinkid}`);
    }

    const mdPath = this._mdPath(thinkid);
    let existing = null;
    if (fs.existsSync(mdPath)) {
      try {
        existing = shared.parseMdRecord(fs.readFileSync(mdPath, 'utf8'), thinkid);
      } catch {
        existing = null;
      }
    }

    const expectedVer = payload.expectedVersion || payload.baseUpdatedAt;
    if (expectedVer) {
      const check = shared.verifyNoConflict(
        {
          exists: Boolean(existing),
          updatedAt: existing ? existing.updatedAt : null,
        },
        expectedVer,
      );
      if (!check.ok) {
        const err = new Error(
          `競合を検出しました (${check.reason}): 現在=${check.currentUpdatedAt}, 期待=${expectedVer}`,
        );
        err.code = 'VERSION_CONFLICT';
        err.currentUpdatedAt = check.currentUpdatedAt;
        throw err;
      }
    }

    const isBackupSnapshot = payload.__canonicalBackupSnapshot === true;
    const requestedUpdatedAt = String(payload.updated_at || payload.updatedAt || '');
    if (isBackupSnapshot && !requestedUpdatedAt) {
      throw new Error('Markdownバックアップに正本の updatedAt がありません。');
    }
    const updatedAt = isBackupSnapshot
      ? requestedUpdatedAt
      : shared.nextVersionTimestamp(
          existing ? existing.updatedAt : requestedUpdatedAt,
        );
    const createdAt = isBackupSnapshot
      ? String(
          payload.created_at ||
          payload.createdAt ||
          (existing && existing.createdAt) ||
          shared.inferCreatedAtFromThinkId(thinkid, updatedAt),
        )
      : (existing && existing.createdAt) ||
        payload.created_at ||
        payload.createdAt ||
        shared.inferCreatedAtFromThinkId(thinkid, updatedAt);

    const category = String(
      payload.category ?? payload.contentType ?? (existing ? existing.category : 'memo'),
    );

    let title = existing ? existing.title : '';
    let body = existing ? existing.body : '';
    if (typeof payload.fullContent === 'string') {
      const nlIdx = payload.fullContent.indexOf('\n');
      if (nlIdx === -1) {
        title = payload.fullContent.replace(/\r$/, '');
        body = '';
      } else {
        title = payload.fullContent.slice(0, nlIdx).replace(/\r$/, '');
        body = payload.fullContent.slice(nlIdx + 1);
      }
    } else {
      if (payload.title !== undefined) title = String(payload.title);
      if (payload.content !== undefined) body = String(payload.content);
      else if (payload.body !== undefined) body = String(payload.body);
    }
    const keywords =
      payload.keywords !== undefined
        ? payload.keywords
        : existing
          ? existing.keywords
          : null;
    const relatedIds =
      payload.related_ids !== undefined
        ? payload.related_ids
        : payload.relatedIds !== undefined
          ? payload.relatedIds
          : existing
            ? existing.relatedIds
            : null;

    const mdText = shared.serializeMdRecord({
      thinkid,
      category,
      title,
      keywords,
      relatedIds,
      createdAt,
      updatedAt,
      body,
    });
    this._atomicWrite(mdPath, mdText);

    if (payload.metadata !== undefined && payload.metadata !== null) {
      const metaObj =
        typeof payload.metadata === 'string'
          ? JSON.parse(payload.metadata)
          : payload.metadata;
      if (shared.hasNonEmptyMetadata(metaObj)) {
        const supText = shared.serializeSupportFile({
          thinkid,
          updatedAt,
          metadata: metaObj,
        });
        this._atomicWrite(this._supportPath(thinkid), supText);
      } else if (isBackupSnapshot && fs.existsSync(this._supportPath(thinkid))) {
        fs.unlinkSync(this._supportPath(thinkid));
      }
    }

    const parsedSaved = shared.parseMdRecord(mdText, thinkid);
    const supSaved = this.readSupportMetadata(thinkid, parsedSaved);
    const savedMeta = shared.toVaultThinkMeta(parsedSaved, supSaved);
    this._recordOverlayUpdate(savedMeta, parsedSaved.body);
    return savedMeta;
  }

  /** Firestore正本の版・作成日時を変えずにMarkdownバックアップへ反映する。 */
  saveBackupSnapshot(payload) {
    return this.saveRecord({ ...payload, __canonicalBackupSnapshot: true });
  }

  /**
   * 思考支援・業務管理メタデータ（<thinkid>.support.json）のみを保存・更新する。
   * .md の更新時刻も同期させることで一覧の更新順と競合検知を一貫させる。
   */
  saveSupportMetadata(thinkid, metadataObj, expectedVersion) {
    const mdPath = this._mdPath(thinkid);
    let existing = null;
    if (fs.existsSync(mdPath)) {
      existing = shared.parseMdRecord(fs.readFileSync(mdPath, 'utf8'), thinkid);
    }

    if (expectedVersion && existing) {
      const check = shared.verifyNoConflict(
        { exists: true, updatedAt: existing.updatedAt },
        expectedVersion,
      );
      if (!check.ok) {
        const err = new Error(`support.json 保存時に競合を検出しました (${check.reason})`);
        err.code = 'VERSION_CONFLICT';
        err.currentUpdatedAt = check.currentUpdatedAt;
        throw err;
      }
    }

    const updatedAt = shared.nextVersionTimestamp(existing ? existing.updatedAt : null);
    const existingSupport = this.readSupportMetadata(thinkid, existing);
    const mergedMetadata = {
      ...(existingSupport?.metadata ?? {}),
      ...(metadataObj ?? {}),
    };

    const supText = shared.serializeSupportFile({
      thinkid,
      updatedAt,
      metadata: mergedMetadata,
    });
    this._atomicWrite(this._supportPath(thinkid), supText);

    if (existing) {
      const mdText = shared.serializeMdRecord({
        thinkid: existing.thinkid,
        category: existing.category,
        title: existing.title,
        keywords: existing.keywords,
        relatedIds: existing.relatedIds,
        createdAt: existing.createdAt,
        updatedAt,
        body: existing.body,
      });
      this._atomicWrite(mdPath, mdText);
      const parsedSaved = shared.parseMdRecord(mdText, thinkid);
      const savedMeta = shared.toVaultThinkMeta(parsedSaved, {
        schemaVersion: 1,
        thinkid,
        updatedAt,
        metadata: mergedMetadata,
      });
      this._recordOverlayUpdate(savedMeta, parsedSaved.body);
    }

    return {
      thinkid,
      updatedAt,
      metadata: mergedMetadata,
    };
  }

  /**
   * レコードを削除する。物理削除せず trash/<thinkid>.md（および .support.json）へ移動する（§4.3）。
   */
  deleteRecord(thinkid) {
    const mdPath = this._mdPath(thinkid);
    const supPath = this._supportPath(thinkid);
    const trashDir = this.getTrashDir();
    fs.mkdirSync(trashDir, { recursive: true });

    if (fs.existsSync(mdPath)) {
      const destMd = path.join(trashDir, `${thinkid}.md`);
      if (fs.existsSync(destMd)) fs.unlinkSync(destMd);
      fs.renameSync(mdPath, destMd);
    }
    if (fs.existsSync(supPath)) {
      const destSup = path.join(trashDir, `${thinkid}.support.json`);
      if (fs.existsSync(destSup)) fs.unlinkSync(destSup);
      fs.renameSync(supPath, destSup);
    }
    this._recordOverlayDelete(thinkid);
    return { thinkid, deletedAt: new Date().toISOString() };
  }

  /**
   * 全文検索（YAML frontmatter を含めず、本文＋タイトル・タグ＋フィールド指定で検索）。
   * body-pack-*.json とインメモリキャッシュを活用し、毎回の全件ファイル読み込みを回避する。
   */
  search(query, limit = 200) {
    const vDir = this.getVaultDir();
    if (!fs.existsSync(vDir)) return [];

    const metas = this.listMeta();
    if (!this._bodyMap) {
      const packTexts = this._bodyPackFiles().map((p) => {
        try {
          return fs.readFileSync(p, 'utf8');
        } catch {
          return null;
        }
      });
      const { bodyMap, versions } = this._bodyMapFromPacks(packTexts);
      for (const m of this._staleBodies(metas, bodyMap, versions)) {
        bodyMap.set(m.thinkid, this._readBodySync(vDir, m.thinkid));
      }
      this._bodyMap = bodyMap;
    }

    const searchable = metas.map((meta) => ({
      meta,
      body: this._bodyMap.get(meta.thinkid) ?? '',
    }));
    return shared.searchVaultRecords(searchable, query, limit);
  }

  /**
   * 全文検索の準備（本文の読み込み）を、起動後に裏で非同期に済ませておく。
   * 本文パックは G: 上で 1 つ 24MB ほどあり、最初の検索で同期的に読むと数秒アプリが止まるため。
   */
  async warmUpSearch() {
    if (this._bodyMap) return;
    const vDir = this.getVaultDir();
    if (!fs.existsSync(vDir)) return;
    const metas = this.listMeta();
    const packTexts = await Promise.all(
      this._bodyPackFiles().map((p) => fs.promises.readFile(p, 'utf8').catch(() => null)),
    );
    const { bodyMap, versions } = this._bodyMapFromPacks(packTexts);
    for (const m of this._staleBodies(metas, bodyMap, versions)) {
      try {
        const raw = await fs.promises.readFile(path.join(vDir, `${m.thinkid}.md`), 'utf8');
        bodyMap.set(m.thinkid, shared.parseMdRecord(raw, m.thinkid).body ?? '');
      } catch {
        bodyMap.set(m.thinkid, '');
      }
    }
    // 待っている間に同期の検索が先に作っていれば、そちらを使う
    if (!this._bodyMap) this._bodyMap = bodyMap;
  }

  /** この端末の本文パックがあればそれだけを使う（全ファイルから作るので最新）。無ければ他の端末のものを使う。 */
  _bodyPackFiles() {
    const indexDir = this.getIndexDir();
    if (!fs.existsSync(indexDir)) return [];
    const own = path.join(indexDir, `body-pack-${this.config.deviceId}.json`);
    if (fs.existsSync(own)) return [own];
    return fs
      .readdirSync(indexDir)
      .filter((f) => f.startsWith('body-pack-') && f.endsWith('.json'))
      .map((f) => path.join(indexDir, f));
  }

  _bodyMapFromPacks(packTexts) {
    const bodyMap = new Map();
    const versions = new Map();
    const packs = [];
    for (const text of packTexts) {
      if (!text) continue;
      try {
        packs.push(JSON.parse(text));
      } catch {
        // ignore broken pack
      }
    }
    for (const [id, entry] of Object.entries(shared.mergeBodyPackEntries(packs))) {
      versions.set(id, entry.updatedAt);
      bodyMap.set(id, entry.body);
    }
    return { bodyMap, versions };
  }

  /** 本文パックに無い、またはパックの版が一覧の版と違う（パックより後に更新された）もの。 */
  _staleBodies(metas, bodyMap, versions) {
    return metas.filter((m) => !bodyMap.has(m.thinkid) || versions.get(m.thinkid) !== m.updatedAt);
  }

  _readBodySync(vDir, thinkid) {
    try {
      return shared.parseMdRecord(fs.readFileSync(path.join(vDir, `${thinkid}.md`), 'utf8'), thinkid).body ?? '';
    } catch {
      return '';
    }
  }

  /**
   * 端末別シャード索引 (.thinktank/index/shard-<deviceId>.json) および
   * Web版オフライン高速全文検索用の本文パック (body-pack-<deviceId>.json) を再構築して書き出す。
   */
  writeDeviceShard({ includeBodyPack = true } = {}) {
    // メインプロセスで G: の全ファイル（約 5,500件）を同期的に読むと 10 秒以上アプリが応答しなくなるので、
    // まず一覧の記録からすぐ索引を書き、ファイルの読み直し（本文パックを含む）は非同期で少しずつ行う。
    const shard = this._writeShardFile(this.listMeta());
    if (includeBodyPack) {
      this.writeFullIndexAsync().catch((err) => {
        console.warn(`[Vault] 本文パックの書き出しに失敗しました: ${err.message || err}`);
      });
    }
    return shard;
  }

  /** 書き出し中の非同期の索引作成が終わるのを待つ（終了処理とテスト用）。 */
  whenIndexIdle() {
    return this._fullIndexPromise || Promise.resolve();
  }

  _collectDeletedIds() {
    const trashDir = this.getTrashDir();
    const deletedIds = {};
    if (fs.existsSync(trashDir)) {
      for (const f of fs.readdirSync(trashDir)) {
        if (f.endsWith('.md')) {
          const stat = fs.statSync(path.join(trashDir, f));
          deletedIds[f.slice(0, -3)] = stat.mtime.toISOString();
        }
      }
    }
    return deletedIds;
  }

  _writeShardFile(metas) {
    const shard = shared.createIndexShard(this.config.deviceId, metas, this._collectDeletedIds());
    const shardPath = path.join(this.getIndexDir(), `shard-${this.config.deviceId}.json`);
    this._atomicWrite(shardPath, JSON.stringify(shard, null, 2) + '\n');
    return shard;
  }

  /**
   * G: の全ファイルを非同期に読み、ファイルの内容そのものから索引と本文パックを作り直す。
   * 一覧の記録には G: をエディタで直接直した分などが入っていないことがあるため、ときどきこれで正す。
   */
  writeFullIndexAsync() {
    if (this._fullIndexPromise) return this._fullIndexPromise;
    this._fullIndexPromise = (async () => {
      const vDir = this.getVaultDir();
      if (!fs.existsSync(vDir)) return 0;
      const names = (await fs.promises.readdir(vDir)).filter(
        (f) => f.endsWith('.md') && !shared.parseDriveConflictFilename(f),
      );
      const metas = [];
      const searchable = [];
      const BATCH = 40;
      for (let i = 0; i < names.length; i += BATCH) {
        const results = await Promise.all(
          names.slice(i, i + BATCH).map(async (f) => {
            try {
              const raw = await fs.promises.readFile(path.join(vDir, f), 'utf8');
              const parsed = shared.parseMdRecord(raw, f.slice(0, -3));
              if (parsed.isDeleted) return null;
              const meta = shared.toVaultThinkMeta(parsed, this.readSupportMetadata(parsed.thinkid, parsed));
              return { meta, body: parsed.body };
            } catch {
              return null;
            }
          }),
        );
        for (const r of results) {
          if (!r) continue;
          metas.push(r.meta);
          searchable.push(r);
        }
      }
      metas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      this._writeShardFile(metas);
      if (typeof shared.createBodyPack === 'function') {
        const bodyPack = shared.createBodyPack(this.config.deviceId, searchable);
        const bodyPackPath = path.join(this.getIndexDir(), `body-pack-${this.config.deviceId}.json`);
        const tmpPath = `${bodyPackPath}.tmp-${process.pid}`;
        await fs.promises.writeFile(tmpPath, JSON.stringify(bodyPack) + '\n', 'utf8');
        await fs.promises.rename(tmpPath, bodyPackPath);
      }
      return metas.length;
    })().finally(() => {
      this._fullIndexPromise = null;
    });
    return this._fullIndexPromise;
  }

  /**
   * ドメインプロファイル（.thinktank/prompts/）を取得する。
   */
  getActiveDomainProfile() {
    const promptsDir = this.getPromptsDir();
    const activeJsonPath = path.join(promptsDir, 'active-profile.json');
    let profileId = this.config.activeProfileId || shared.DEFAULT_DOMAIN_PROFILE_ID;

    if (fs.existsSync(activeJsonPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(activeJsonPath, 'utf8'));
        if (typeof cfg.activeProfileId === 'string' && cfg.activeProfileId.trim()) {
          profileId = cfg.activeProfileId.trim();
        }
      } catch {
        // ignore
      }
    }

    return this.getDomainProfileById(profileId);
  }

  getDomainProfileById(profileId) {
    const promptsDir = this.getPromptsDir();
    const profilePath = path.join(promptsDir, profileId, 'profile.json');
    if (fs.existsSync(profilePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        return shared.resolveDomainProfile(raw, profileId);
      } catch (e) {
        console.warn(`[VaultEngine] Failed to parse profile.json (${profileId}):`, e.message);
      }
    }
    return shared.getBuiltinDomainProfile(profileId);
  }

  setActiveDomainProfile(profileId) {
    const resolved = this.getDomainProfileById(profileId);
    this.saveConfig({ activeProfileId: resolved.id });

    const promptsDir = this.getPromptsDir();
    const activeJsonPath = path.join(promptsDir, 'active-profile.json');
    try {
      fs.mkdirSync(promptsDir, { recursive: true });
      const current = fs.existsSync(activeJsonPath)
        ? JSON.parse(fs.readFileSync(activeJsonPath, 'utf8'))
        : { availableProfiles: Object.keys(shared.BUILTIN_DOMAIN_PROFILES) };
      current.activeProfileId = resolved.id;
      this._atomicWrite(activeJsonPath, JSON.stringify(current, null, 2) + '\n');
    } catch (e) {
      console.warn('[VaultEngine] Failed to write active-profile.json:', e.message);
    }
    return resolved;
  }

  saveCustomDomainProfile(profileObj) {
    const resolved = shared.resolveDomainProfile(
      profileObj,
      profileObj?.id || this.config.activeProfileId,
    );
    const promptsDir = this.getPromptsDir();
    const targetDir = path.join(promptsDir, resolved.id);
    fs.mkdirSync(targetDir, { recursive: true });
    this._atomicWrite(
      path.join(targetDir, 'profile.json'),
      JSON.stringify(resolved, null, 2) + '\n',
    );
    return resolved;
  }
}

module.exports = {
  VaultEngine,
};
