'use strict';

/**
 * electron/vaultEngine.cjs
 * Drive 正本（形式バージョン1）のローカル Vault エンジン。
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

class VaultEngine {
  constructor({ userDataDir, appRootDir, defaultVaultDir }) {
    this.userDataDir = userDataDir;
    this.appRootDir = appRootDir;
    this.configFilePath = path.join(userDataDir, 'vault-engine-config.json');
    this.config = this._loadConfig(defaultVaultDir);
    this._ensureDirs();
  }

  _loadConfig(defaultVaultDir) {
    const defaultDeviceId = `pc_${os.hostname().replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const base = {
      vaultDir: defaultVaultDir,
      deviceId: defaultDeviceId,
      preferredCli: 'claude',
      preferredModel: '',
      activeProfileId: shared.DEFAULT_DOMAIN_PROFILE_ID,
    };
    if (fs.existsSync(this.configFilePath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
        return { ...base, ...loaded };
      } catch {
        return base;
      }
    }
    return base;
  }

  saveConfig(partial) {
    this.config = { ...this.config, ...partial };
    fs.mkdirSync(path.dirname(this.configFilePath), { recursive: true });
    fs.writeFileSync(this.configFilePath, JSON.stringify(this.config, null, 2) + '\n', 'utf8');
    this._ensureDirs();
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
   */
  listMeta() {
    const vDir = this.getVaultDir();
    if (!fs.existsSync(vDir)) return [];

    const files = fs.readdirSync(vDir);
    const metas = [];
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      if (shared.parseDriveConflictFilename(f)) continue;
      const fallbackId = f.slice(0, -3);
      try {
        const raw = fs.readFileSync(path.join(vDir, f), 'utf8');
        const parsed = shared.parseMdRecord(raw, fallbackId);
        if (parsed.isDeleted) continue;
        const support = this.readSupportMetadata(parsed.thinkid, parsed);
        metas.push(shared.toVaultThinkMeta(parsed, support));
      } catch (e) {
        console.warn(`[VaultEngine] listMeta skip ${f}:`, e.message);
      }
    }
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

    const updatedAt = shared.nextVersionTimestamp(
      existing ? existing.updatedAt : payload.updated_at || payload.updatedAt,
    );
    const createdAt =
      (existing && existing.createdAt) ||
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
      }
    }

    const parsedSaved = shared.parseMdRecord(mdText, thinkid);
    const supSaved = this.readSupportMetadata(thinkid, parsedSaved);
    return shared.toVaultThinkMeta(parsedSaved, supSaved);
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
    return { thinkid, deletedAt: new Date().toISOString() };
  }

  /**
   * 全文検索（YAML frontmatter を含めず、本文＋タイトル・タグ＋フィールド指定で検索）。
   */
  search(query, limit = 200) {
    const vDir = this.getVaultDir();
    if (!fs.existsSync(vDir)) return [];

    const searchable = [];
    for (const f of fs.readdirSync(vDir)) {
      if (!f.endsWith('.md')) continue;
      if (shared.parseDriveConflictFilename(f)) continue;
      try {
        const raw = fs.readFileSync(path.join(vDir, f), 'utf8');
        const parsed = shared.parseMdRecord(raw, f.slice(0, -3));
        if (parsed.isDeleted) continue;
        const support = this.readSupportMetadata(parsed.thinkid, parsed);
        searchable.push({
          meta: shared.toVaultThinkMeta(parsed, support),
          body: parsed.body,
        });
      } catch {
        // skip
      }
    }
    return shared.searchVaultRecords(searchable, query, limit);
  }

  /**
   * 端末別シャード索引 (.thinktank/index/shard-<deviceId>.json) および
   * Web版オフライン高速全文検索用の本文パック (body-pack-<deviceId>.json) を再構築して書き出す。
   */
  writeDeviceShard() {
    const vDir = this.getVaultDir();
    const metas = [];
    const searchable = [];
    if (fs.existsSync(vDir)) {
      for (const f of fs.readdirSync(vDir)) {
        if (!f.endsWith('.md')) continue;
        if (shared.parseDriveConflictFilename(f)) continue;
        const fallbackId = f.slice(0, -3);
        try {
          const raw = fs.readFileSync(path.join(vDir, f), 'utf8');
          const parsed = shared.parseMdRecord(raw, fallbackId);
          if (parsed.isDeleted) continue;
          const support = this.readSupportMetadata(parsed.thinkid, parsed);
          const meta = shared.toVaultThinkMeta(parsed, support);
          metas.push(meta);
          searchable.push({ meta, body: parsed.body });
        } catch {
          // skip
        }
      }
    }
    metas.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

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
    const shard = shared.createIndexShard(this.config.deviceId, metas, deletedIds);
    const shardPath = path.join(this.getIndexDir(), `shard-${this.config.deviceId}.json`);
    this._atomicWrite(shardPath, JSON.stringify(shard, null, 2) + '\n');

    if (typeof shared.createBodyPack === 'function') {
      const bodyPack = shared.createBodyPack(this.config.deviceId, searchable);
      const bodyPackPath = path.join(this.getIndexDir(), `body-pack-${this.config.deviceId}.json`);
      this._atomicWrite(bodyPackPath, JSON.stringify(bodyPack) + '\n');
    }

    return shard;
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
