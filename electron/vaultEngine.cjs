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
 * - ローカル運用モード（localVaultRoot 指定時）では、このフォルダ配下の .md を正本とする
 *   （thinks/ snapshots/ trash/ system/ の配置。docs/261103/ローカル運用モード.md）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const shared = require('./shared-dist/index.js');
const { perfTime } = require('./perfLog.cjs');

function hostnameToken() {
  return os.hostname().replace(/[^A-Za-z0-9_-]/g, '_');
}

/** trash/ の退避名に使う日時。同期フォルダ上でも並び順が分かり、ファイル名に使えない文字を含まない。 */
function fileTimestamp(ms = Date.now()) {
  return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

/** thinkid には '.' が入らないので、退避名 <thinkid>.<理由>-<日時>.md の先頭が thinkid になる。 */
function thinkIdFromTrashName(fileName) {
  return fileName.split('.')[0];
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** 移行で上書きされた版の退避（<id>.overwritten-…）は削除ではないので数えない */
function isTrashDeletion(fileName) {
  return fileName.endsWith('.md') && (!fileName.slice(0, -3).includes('.') || fileName.includes('.deleted-'));
}

const META_READ_BATCH = 40;

/** 追記がこの大きさになったら全体へ書き戻す（1 件あたり数 KB なので千回に一度ほど）。 */
const OVERLAY_JOURNAL_MAX_BYTES = 4 * 1024 * 1024;

class VaultEngine {
  /**
   * @param {{ userDataDir: string, appRootDir: string, defaultVaultDir: string, deviceIdPrefix?: string }} options
   * deviceIdPrefix は起動するプログラムの種類（Electron 版は 'pc'、常駐エージェントは 'agent'）。
   */
  constructor({ userDataDir, appRootDir, defaultVaultDir, deviceIdPrefix = 'pc', autoIndexRefresh = false, localVaultRoot = '' }) {
    this.userDataDir = userDataDir;
    this.appRootDir = appRootDir;
    this.deviceIdPrefix = deviceIdPrefix;
    this.autoIndexRefresh = autoIndexRefresh;
    this.localVaultRoot = localVaultRoot ? path.resolve(localVaultRoot) : '';
    this._shardTimer = null;
    this._bodyPackTimer = null;
    this._fullIndexPromise = null;
    this._indexRefreshPromise = null;
    this._saveChains = new Map();
    this.configFilePath = path.join(userDataDir, 'vault-engine-config.json');
    // 一覧の記録はフォルダごとに分ける。Firestore のバックアップ先と混ざらないようにし、
    // 同期フォルダ内に置かないことで別PCの記録とも混ざらないようにする。
    this.overlayFilePath = this.localVaultRoot
      ? path.join(
          userDataDir,
          `vault-meta-overlay-local-${crypto.createHash('sha256').update(this.localVaultRoot.toLowerCase()).digest('hex').slice(0, 12)}.json`,
        )
      : path.join(userDataDir, 'vault-meta-overlay.json');
    this.overlayJournalPath = `${this.overlayFilePath}.log`;
    this._overlay = null;
    this._overlayStamp = '';
    this.defaultVaultDir = defaultVaultDir;
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

  /** 別プロセス（単体起動の MCP サーバー）も同じファイルを書くので、変化を検知して読み直す。 */
  _overlayFilesStamp() {
    const stamp = (filePath) => {
      try {
        const st = fs.statSync(filePath);
        return `${st.mtimeMs}:${st.size}`;
      } catch {
        return '-';
      }
    };
    return `${stamp(this.overlayFilePath)}|${stamp(this.overlayJournalPath)}`;
  }

  _readOverlayBase() {
    if (!fs.existsSync(this.overlayFilePath)) {
      return { updated: {}, deleted: {}, shardChecked: {} };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.overlayFilePath, 'utf8'));
      return {
        updated: parsed && typeof parsed.updated === 'object' ? parsed.updated : {},
        deleted: parsed && typeof parsed.deleted === 'object' ? parsed.deleted : {},
        shardChecked: parsed && typeof parsed.shardChecked === 'object' ? parsed.shardChecked : {},
      };
    } catch {
      return { updated: {}, deleted: {}, shardChecked: {} };
    }
  }

  _applyOverlayJournal(overlay) {
    let text = '';
    try {
      text = fs.readFileSync(this.overlayJournalPath, 'utf8');
    } catch {
      return;
    }
    for (const line of text.split('\n')) {
      if (!line) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // 書き込み中に落ちた行。一覧の記録なので読み飛ばしても元のファイルから作り直せる
      }
      if (entry.updated && entry.updated.thinkid) {
        overlay.updated[entry.updated.thinkid] = entry.updated;
        delete overlay.deleted[entry.updated.thinkid];
      } else if (entry.deleted) {
        delete overlay.updated[entry.deleted];
        overlay.deleted[entry.deleted] = entry.at;
      }
    }
  }

  _loadOverlay() {
    const stamp = this._overlayFilesStamp();
    if (this._overlay && this._overlayStamp === stamp) return this._overlay;
    const overlay = this._readOverlayBase();
    this._applyOverlayJournal(overlay);
    this._overlay = overlay;
    this._overlayStamp = stamp;
    return overlay;
  }

  _saveOverlay(overlay) {
    try {
      this._atomicWrite(this.overlayFilePath, JSON.stringify(overlay) + '\n');
      fs.rmSync(this.overlayJournalPath, { force: true });
      this._overlay = overlay;
      this._overlayStamp = this._overlayFilesStamp();
    } catch {
      // ignore
    }
  }

  /**
   * 全体（約 15MB）の読み書きをメインプロセスで保存のたびに行うと入力が止まるので、
   * 1 件分だけ追記する。追記なのでクラッシュしても保存済みの分は失われない。
   */
  _appendOverlayJournal(overlay, entry) {
    try {
      fs.appendFileSync(this.overlayJournalPath, JSON.stringify(entry) + '\n', 'utf8');
      if (fs.statSync(this.overlayJournalPath).size >= OVERLAY_JOURNAL_MAX_BYTES) {
        this._saveOverlay(overlay);
      } else {
        this._overlayStamp = this._overlayFilesStamp();
      }
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
    this._appendOverlayJournal(overlay, { updated: meta });
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
    const deletedAt = new Date().toISOString();
    delete overlay.updated[thinkid];
    overlay.deleted[thinkid] = deletedAt;
    this._appendOverlayJournal(overlay, { deleted: thinkid, at: deletedAt });
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

  async _readShardCachedAsync(filePath) {
    if (!this._shardCache) this._shardCache = new Map();
    try {
      const st = await fs.promises.stat(filePath);
      const hit = this._shardCache.get(filePath);
      if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.data;
      const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      this._shardCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, data });
      return data;
    } catch {
      return null;
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

  /** G: の一覧取得・ごみ箱の確認・書き出しで合計 1 秒ほどかかるので、メインプロセスを止めないよう非同期で行う。 */
  _writeIndexSafely({ includeBodyPack = true } = {}) {
    const run = async () => {
      await this._writeShardFileAsync(await this.listMetaAsync());
      if (includeBodyPack) await this.writeFullIndexAsync();
    };
    this._indexRefreshPromise = (this._indexRefreshPromise || Promise.resolve())
      .then(() => perfTime('index-refresh', run))
      .catch((err) => console.warn(`[Vault] 索引の書き出しに失敗しました: ${err.message || err}`));
    return this._indexRefreshPromise;
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
    let shouldPersist = false;
    if (fs.existsSync(this.configFilePath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
        config = { ...base, ...loaded };
      } catch {
        config = base;
      }
    }
    if (config.preferredCli === 'gemini') {
      config.preferredCli = 'antigravity';
      shouldPersist = true;
    }
    if (this._needsNewDeviceId(config.deviceId)) {
      config.deviceId = this._generateDeviceId();
      shouldPersist = true;
    }
    if (shouldPersist) this._writeConfigFile(config);
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
    const normalizedPartial = partial.preferredCli === 'gemini'
      ? { ...partial, preferredCli: 'antigravity' }
      : partial;
    this.config = { ...this.config, ...normalizedPartial };
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

  isLocalMode() {
    return Boolean(this.localVaultRoot);
  }

  /**
   * vaultDir が .../vault_ver2 を指している場合はその親を VaultRoot とみなし、
   * そうでない場合は vaultDir 直下に vault_ver2 がある場合はそれを使う。
   */
  getVaultDir() {
    if (this.localVaultRoot) return path.join(this.localVaultRoot, 'thinks');
    let configured = this.config.vaultDir;
    // Drive for desktop 未起動などでドライブ自体が無いと mkdir が起動時に落ちる。
    // 設定は残し、ドライブが戻れば自動で元の場所に戻す。
    const driveRoot = path.parse(path.resolve(configured)).root;
    if (driveRoot && !fs.existsSync(driveRoot)) {
      configured = this.defaultVaultDir;
    }
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
    if (this.localVaultRoot) return this.localVaultRoot;
    const vDir = this.getVaultDir();
    return path.basename(vDir) === 'vault_ver2' ? path.dirname(vDir) : vDir;
  }

  getTrashDir() {
    return path.join(this.getVaultRootDir(), 'trash');
  }

  /** アプリ用ファイルの置き場。ローカル運用では利用者に分かる名前の system/ にする。 */
  _systemDir() {
    return path.join(this.getVaultRootDir(), this.localVaultRoot ? 'system' : '.thinktank');
  }

  getIndexDir() {
    return path.join(this._systemDir(), 'index');
  }

  getSnapshotsDir() {
    return path.join(this.getVaultRootDir(), 'snapshots');
  }

  getPromptsDir() {
    const vaultPrompts = path.join(this._systemDir(), 'prompts');
    if (fs.existsSync(vaultPrompts)) {
      return vaultPrompts;
    }
    return path.join(this.appRootDir, '.thinktank', 'prompts');
  }

  _ensureDirs() {
    fs.mkdirSync(this.getVaultDir(), { recursive: true });
    fs.mkdirSync(this.getTrashDir(), { recursive: true });
    fs.mkdirSync(this.getIndexDir(), { recursive: true });
    if (this.localVaultRoot) fs.mkdirSync(this.getSnapshotsDir(), { recursive: true });
  }

  /**
   * ローカル運用では、消す・上書きされる版を trash/ へ日時付きで退避する。
   * 同じ Think を何度消しても前の退避を上書きしない（同期フォルダ上でのファイル消失対策）。
   * 同じミリ秒に続けて退避すると名前が重なるため、既にあれば日時を 1 ミリ秒ずつ進めて空いている名前にする。
   * .md と .support.json は同じ日時でそろえる（exts の全部が空いている日時を選ぶ）。
   * @returns {string[]} exts と同じ順の退避先パス
   */
  _trashPaths(thinkid, reason, exts) {
    const dir = this.getTrashDir();
    for (let ms = Date.now(); ; ms++) {
      const stamp = fileTimestamp(ms);
      const paths = exts.map(ext => path.join(dir, `${thinkid}.${reason}-${stamp}${ext}`));
      if (!paths.some(p => fs.existsSync(p))) return paths;
    }
  }

  /** 現在の .md / .support.json を消さずに trash/ へ写す（移行で上書きされる側を残す）。 */
  stashCurrentVersion(thinkid, reason = 'overwritten') {
    const mdPath = this._mdPath(thinkid);
    if (!fs.existsSync(mdPath)) return false;
    fs.mkdirSync(this.getTrashDir(), { recursive: true });
    const [mdDest, supDest] = this._trashPaths(thinkid, reason, ['.md', '.support.json']);
    fs.copyFileSync(mdPath, mdDest);
    const supPath = this._supportPath(thinkid);
    if (fs.existsSync(supPath)) fs.copyFileSync(supPath, supDest);
    return true;
  }

  /** 移行元など、手元に無い版を trash/ へ書き残す。 */
  stashExternalVersion(record, reason) {
    const thinkid = String(record?.meta?.thinkid ?? '');
    if (!shared.isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    const meta = record.meta;
    const mdText = shared.serializeMdRecord({
      thinkid,
      category: meta.category,
      title: meta.title,
      keywords: meta.keywords,
      relatedIds: meta.relatedIds,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      body: record.body ?? '',
    });
    const [mdDest, supDest] = this._trashPaths(thinkid, reason, ['.md', '.support.json']);
    this._atomicWrite(mdDest, mdText);
    if (shared.hasNonEmptyMetadata(meta.metadata)) {
      this._atomicWrite(
        supDest,
        shared.serializeSupportFile({ thinkid, updatedAt: meta.updatedAt, metadata: meta.metadata }),
      );
    }
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

  async _atomicWriteAsync(targetPath, content) {
    const dir = path.dirname(targetPath);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmpPath = path.join(
      dir,
      `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`,
    );
    await fs.promises.writeFile(tmpPath, content, 'utf8');
    await fs.promises.rename(tmpPath, targetPath);
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

    const indexDir = this.getIndexDir();
    let shards = [];
    if (fs.existsSync(indexDir)) {
      try {
        shards = this._shardFileNames(fs.readdirSync(indexDir))
          .map((sf) => this._readShardCached(path.join(indexDir, sf)))
          .filter(Boolean);
      } catch {
        // ignore index read error
      }
    }

    const plan = this._planMetaList(fs.readdirSync(vDir), shards);
    for (const item of plan.unread) {
      try {
        this._applyMetaFile(plan, item, fs.readFileSync(path.join(vDir, `${item.id}.md`), 'utf8'));
      } catch (e) {
        console.warn(`[VaultEngine] listMeta skip ${item.id}.md:`, e.message);
      }
    }
    if (plan.overlayDirty) {
      this._saveOverlay(plan.overlay);
    }

    this._metaMap = plan.metaMap;
    this._cachedVaultDir = vDir;

    return this._sortedMetas(plan.metaMap);
  }

  /**
   * listMeta の非同期版。自動更新は保存の裏で走るので、G: の待ち時間でメインプロセスを止めない。
   * 読んでいる間に保存された分を含まないことがあるので、_metaMap は置き換えない。
   */
  async listMetaAsync() {
    const vDir = this.getVaultDir();
    const files = await fs.promises.readdir(vDir).catch(() => null);
    if (!files) return [];

    const indexDir = this.getIndexDir();
    const indexFiles = await fs.promises.readdir(indexDir).catch(() => []);
    const shards = (await Promise.all(
      this._shardFileNames(indexFiles).map((sf) => this._readShardCachedAsync(path.join(indexDir, sf))),
    )).filter(Boolean);

    const plan = this._planMetaList(files, shards);
    for (let i = 0; i < plan.unread.length; i += META_READ_BATCH) {
      await Promise.all(plan.unread.slice(i, i + META_READ_BATCH).map(async (item) => {
        try {
          this._applyMetaFile(plan, item, await fs.promises.readFile(path.join(vDir, `${item.id}.md`), 'utf8'));
        } catch (e) {
          console.warn(`[VaultEngine] listMeta skip ${item.id}.md:`, e.message);
        }
      }));
    }
    if (plan.overlayDirty) {
      this._saveOverlay(plan.overlay);
    }
    return this._sortedMetas(plan.metaMap);
  }

  _shardFileNames(indexFiles) {
    return indexFiles.filter((f) => f.startsWith('shard-') && f.endsWith('.json'));
  }

  _sortedMetas(metaMap) {
    const metas = Array.from(metaMap.values());
    metas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return metas;
  }

  /** 手元の記録で足りるものは一覧に入れ、ファイルを読み直す必要があるものを unread に分ける。 */
  _planMetaList(files, shards) {
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

    const shardMap = new Map();
    if (shards.length > 0) {
      for (const m of shared.mergeIndexShards(shards)) {
        shardMap.set(m.thinkid, m);
      }
    }

    // 手元の記録（overlay）はこの PC で読んだ・書いた版。携帯の Web 版や別の PC が更新すると、
    // その端末の索引シャードのほうが新しくなるので、そのときはファイルを読み直す。
    // （以前は overlay が常にシャードより優先され、他の端末での更新に気づかなかった）
    // G: の全ファイルの更新時刻を調べると数秒かかるため、シャードとの比較で読み直す対象を絞る。
    const overlay = this._loadOverlay();

    const metaMap = new Map();
    const unread = [];
    for (const id of mdIds) {
      const hasExternalSupport = supSet.has(id) || legSet.has(id);
      const ownMeta = overlay.updated[id] && typeof overlay.updated[id] === 'object' ? overlay.updated[id] : null;
      const shardMeta = shardMap.get(id);
      // 読み直してもファイルがシャードより古いままなら、そのシャードの日付が誤っている
      // （例: 古い版の PC が frontmatter の無いメモに更新時刻を付けた）。同じ値で読み直し続けると
      // 起動のたびに G: の数千件を同期で読み、画面が数分固まるので、確かめた値は覚えておく。
      const changedElsewhere =
        ownMeta && shardMeta && (shardMeta.updatedAt || '') > (ownMeta.updatedAt || '') &&
        overlay.shardChecked[id] !== shardMeta.updatedAt;
      const cachedMeta = changedElsewhere ? null : ownMeta || shardMeta;
      if (cachedMeta && (!hasExternalSupport || cachedMeta.metadata)) {
        metaMap.set(id, cachedMeta);
        continue;
      }
      unread.push({ id, hasExternalSupport, shardMeta });
    }
    return { metaMap, overlay, unread, overlayDirty: false };
  }

  _applyMetaFile(plan, { id, hasExternalSupport, shardMeta }, raw) {
    const parsed = shared.parseMdRecord(raw, id);
    if (parsed.isDeleted) return;
    const support = hasExternalSupport || parsed.legacyEmbeddedMetadata
      ? this.readSupportMetadata(parsed.thinkid, parsed)
      : null;
    const meta = shared.toVaultThinkMeta(parsed, support);
    plan.metaMap.set(meta.thinkid, meta);
    if (this._bodyMap) this._bodyMap.set(meta.thinkid, parsed.body);
    plan.overlay.updated[meta.thinkid] = meta;
    if (shardMeta && (shardMeta.updatedAt || '') > (meta.updatedAt || '')) {
      plan.overlay.shardChecked[meta.thinkid] = shardMeta.updatedAt;
    }
    plan.overlayDirty = true;
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
    const thinkid = this._payloadThinkId(payload);
    const mdPath = this._mdPath(thinkid);
    let existing = null;
    if (fs.existsSync(mdPath)) {
      try {
        existing = shared.parseMdRecord(fs.readFileSync(mdPath, 'utf8'), thinkid);
      } catch {
        existing = null;
      }
    }

    const plan = this._planSave(payload, thinkid, existing);
    this._atomicWrite(mdPath, plan.mdText);
    const supPath = this._supportPath(thinkid);
    if (plan.supText !== null) {
      this._atomicWrite(supPath, plan.supText);
    } else if (plan.removeSupport && fs.existsSync(supPath)) {
      fs.unlinkSync(supPath);
    }
    return this._finishSave(plan);
  }

  /**
   * saveRecord の非同期版。画面からの保存は入力の合間に走るので、G: の待ち時間でメインプロセスを止めない。
   * 同じ Think の保存は読み取りから書き込みまでを 1 件ずつ行い、版の確認と更新の間に別の保存が割り込まないようにする。
   */
  saveRecordAsync(payload) {
    const thinkid = this._payloadThinkId(payload);
    const previous = this._saveChains.get(thinkid) || Promise.resolve();
    const run = previous.catch(() => {}).then(() => this._saveRecordNowAsync(payload, thinkid));
    this._saveChains.set(thinkid, run);
    const release = () => {
      if (this._saveChains.get(thinkid) === run) this._saveChains.delete(thinkid);
    };
    run.then(release, release);
    return run;
  }

  async _saveRecordNowAsync(payload, thinkid) {
    const mdPath = this._mdPath(thinkid);
    let existing = null;
    try {
      existing = shared.parseMdRecord(await fs.promises.readFile(mdPath, 'utf8'), thinkid);
    } catch {
      existing = null;
    }

    const plan = this._planSave(payload, thinkid, existing);
    await this._atomicWriteAsync(mdPath, plan.mdText);
    const supPath = this._supportPath(thinkid);
    if (plan.supText !== null) {
      await this._atomicWriteAsync(supPath, plan.supText);
    } else if (plan.removeSupport) {
      await fs.promises.rm(supPath, { force: true });
    }
    return this._finishSave(plan);
  }

  _payloadThinkId(payload) {
    const thinkid = String(payload.thinkid ?? payload.id ?? '');
    if (!shared.isSafeThinkId(thinkid)) {
      throw new Error(`不正な thinkid です: ${thinkid}`);
    }
    return thinkid;
  }

  /** 版の確認と、書き出す内容の組み立て（ファイルには触れない）。 */
  _planSave(payload, thinkid, existing) {
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
    let supText = null;
    let removeSupport = false;
    let support = null;
    // 保存した端末の id（画面からの保存で付く）。metadata が無い保存でも既存の metadata に加えて記録する
    const savedDeviceId =
      !isBackupSnapshot && typeof payload.savedDeviceId === 'string' ? payload.savedDeviceId.trim() : '';
    let requestedMetadata = payload.metadata;
    if (savedDeviceId) {
      const base =
        requestedMetadata !== undefined && requestedMetadata !== null
          ? (typeof requestedMetadata === 'string' ? JSON.parse(requestedMetadata) : requestedMetadata)
          : (existing ? this.readSupportMetadata(thinkid, existing)?.metadata : null) ?? {};
      requestedMetadata = { ...base, savedDeviceId };
    }
    if (requestedMetadata !== undefined && requestedMetadata !== null) {
      const metaObj =
        typeof requestedMetadata === 'string'
          ? JSON.parse(requestedMetadata)
          : requestedMetadata;
      if (shared.hasNonEmptyMetadata(metaObj)) {
        support = { schemaVersion: 1, thinkid, updatedAt, metadata: metaObj };
        supText = shared.serializeSupportFile({
          thinkid,
          updatedAt,
          metadata: metaObj,
        });
      } else if (isBackupSnapshot) {
        removeSupport = true;
      }
    }
    return { thinkid, mdText, supText, removeSupport, support };
  }

  _finishSave({ thinkid, mdText, support }) {
    const parsedSaved = shared.parseMdRecord(mdText, thinkid);
    // 書いたばかりの内容を G: から読み直さない
    const supSaved = support ?? this.readSupportMetadata(thinkid, parsedSaved);
    const savedMeta = shared.toVaultThinkMeta(parsedSaved, supSaved);
    this._recordOverlayUpdate(savedMeta, parsedSaved.body);
    return savedMeta;
  }

  /** Firestore正本の版・作成日時を変えずにMarkdownバックアップへ反映する。 */
  saveBackupSnapshot(payload) {
    return this.saveRecord({ ...payload, __canonicalBackupSnapshot: true });
  }

  saveBackupSnapshotAsync(payload) {
    return this.saveRecordAsync({ ...payload, __canonicalBackupSnapshot: true });
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

    if (this.localVaultRoot) {
      const [mdDest, supDest] = this._trashPaths(thinkid, 'deleted', ['.md', '.support.json']);
      if (fs.existsSync(mdPath)) fs.renameSync(mdPath, mdDest);
      if (fs.existsSync(supPath)) fs.renameSync(supPath, supDest);
      this._recordOverlayDelete(thinkid);
      return { thinkid, deletedAt: new Date().toISOString() };
    }

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
    const metas = await this.listMetaAsync();
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

  /** 書き出し中の非同期の索引作成が終わるのを待つ（終了処理とテスト用）。 */
  async whenIndexIdle() {
    await this._indexRefreshPromise;
    await this._fullIndexPromise;
  }

  async _collectDeletedIdsAsync() {
    const trashDir = this.getTrashDir();
    const names = await fs.promises.readdir(trashDir).catch(() => []);
    const deletedIds = {};
    const deletions = names.filter(isTrashDeletion);
    for (let i = 0; i < deletions.length; i += META_READ_BATCH) {
      await Promise.all(deletions.slice(i, i + META_READ_BATCH).map(async (f) => {
        const stat = await fs.promises.stat(path.join(trashDir, f));
        const id = thinkIdFromTrashName(f);
        const mtimeIso = stat.mtime.toISOString();
        if (!deletedIds[id] || deletedIds[id] < mtimeIso) deletedIds[id] = mtimeIso;
      }));
    }
    return deletedIds;
  }

  async _writeShardFileAsync(metas) {
    const shard = shared.createIndexShard(this.config.deviceId, metas, await this._collectDeletedIdsAsync());
    const shardPath = path.join(this.getIndexDir(), `shard-${this.config.deviceId}.json`);
    await this._atomicWriteAsync(shardPath, JSON.stringify(shard, null, 2) + '\n');
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
      await this._writeShardFileAsync(metas);
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
   * 移行用。手元の版より新しいときだけ書き込み、作成・更新日時は移行元の値を保つ。
   * 上書きされる手元の版は trash/ に残す。
   */
  importNewerRecord(payload) {
    const thinkid = String(payload?.thinkid ?? '');
    const incomingUpdatedAt = String(payload?.updatedAt ?? '');
    if (!incomingUpdatedAt) throw new Error(`移行元の更新日時がありません: ${thinkid}`);
    const existing = this.getRecord(thinkid);
    if (existing && (existing.meta.updatedAt || '') >= incomingUpdatedAt) {
      return { thinkid, status: 'skipped', updatedAt: existing.meta.updatedAt };
    }
    if (existing) this.stashCurrentVersion(thinkid, 'overwritten');
    const meta = this.saveBackupSnapshot(payload);
    return { thinkid, status: existing ? 'updated' : 'created', updatedAt: meta.updatedAt };
  }

  // ── スナップショット（ローカル運用。Firestore の snapshots/current と同じ契約） ──

  _snapshotPath(thinkid) {
    if (!shared.isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    return path.join(this.getSnapshotsDir(), thinkid, 'current.json');
  }

  createSnapshot(thinkid) {
    const record = this.getRecord(thinkid);
    if (!record) throw new Error(`対象の Think「${thinkid}」が見つかりません。`);
    const snapshot = {
      schemaVersion: 1,
      thinkid,
      title: record.meta.title,
      body: record.body,
      metadata: record.meta.metadata ?? {},
      sourceUpdatedAt: record.meta.updatedAt,
      snapshotAt: new Date().toISOString(),
    };
    this._atomicWrite(this._snapshotPath(thinkid), JSON.stringify(snapshot, null, 2) + '\n');
    return snapshot;
  }

  getSnapshot(thinkid) {
    const filePath = this._snapshotPath(thinkid);
    return fs.existsSync(filePath) ? readJsonFile(filePath) : null;
  }

  listSnapshots(thinkid) {
    const dir = path.dirname(this._snapshotPath(thinkid));
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJsonFile(path.join(dir, f)))
      .filter((s) => s && typeof s.snapshotAt === 'string')
      .sort((x, y) => x.snapshotAt.localeCompare(y.snapshotAt));
  }

  /** 破棄したスナップショットも消さずに trash/ へ移す。 */
  deleteSnapshot(thinkid) {
    const filePath = this._snapshotPath(thinkid);
    if (!fs.existsSync(filePath)) return;
    fs.mkdirSync(this.getTrashDir(), { recursive: true });
    fs.renameSync(filePath, this._trashPaths(thinkid, 'snapshot', ['.json'])[0]);
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
}

module.exports = {
  VaultEngine,
};
