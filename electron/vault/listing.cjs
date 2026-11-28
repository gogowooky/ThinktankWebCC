'use strict';

/**
 * electron/vault/listing.cjs
 * Think 一覧（メタデータ）と思考支援メタデータの読み取り。
 * メソッドは electron/vaultEngine.cjs で VaultEngine.prototype に取り込む（this は VaultEngine）。
 */

const fs = require('fs');
const path = require('path');
const shared = require('../shared-dist/index.js');
const { META_READ_BATCH } = require('./helpers.cjs');

class VaultListing {
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
}

module.exports = { VaultListing };
