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
const crypto = require('crypto');
const shared = require('./shared-dist/index.js');
const { hostnameToken } = require('./vault/helpers.cjs');
const { VaultOverlay } = require('./vault/overlay.cjs');
const { VaultIndexing } = require('./vault/indexing.cjs');
const { VaultSearch } = require('./vault/search.cjs');
const { VaultListing } = require('./vault/listing.cjs');
const { VaultRecords } = require('./vault/records.cjs');
const { VaultTrashAndSnapshots } = require('./vault/trashAndSnapshots.cjs');
const { VaultDomainProfiles } = require('./vault/domainProfiles.cjs');

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

  _loadConfig(defaultVaultDir) {
    const base = {
      vaultDir: defaultVaultDir,
      deviceId: '',
      preferredCli: 'claude',
      preferredModel: '',
      activeProfileId: shared.DEFAULT_DOMAIN_PROFILE_ID,
      workspaceGasUrl: '',
      workspaceGasToken: '',
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
}

/**
 * 部品クラスのメソッドを VaultEngine.prototype に取り込む。
 * class 構文のメソッドと同じ属性（列挙されない）で定義し、名前が重なったら起動時に気づけるよう例外にする。
 */
function mixInMethods(target, ...sources) {
  for (const source of sources) {
    for (const name of Object.getOwnPropertyNames(source.prototype)) {
      if (name === 'constructor') continue;
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) {
        throw new Error(`VaultEngine: メソッド名が重複しています: ${name}`);
      }
      Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name));
    }
  }
}

mixInMethods(VaultEngine, VaultOverlay, VaultIndexing, VaultSearch, VaultListing, VaultRecords, VaultTrashAndSnapshots, VaultDomainProfiles);

module.exports = {
  VaultEngine,
};
