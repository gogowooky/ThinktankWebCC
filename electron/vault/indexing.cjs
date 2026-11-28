'use strict';

/**
 * electron/vault/indexing.cjs
 * 端末別シャード索引・本文パックの作り直しと、その予定の管理。
 * メソッドは electron/vaultEngine.cjs で VaultEngine.prototype に取り込む（this は VaultEngine）。
 */

const fs = require('fs');
const path = require('path');
const shared = require('../shared-dist/index.js');
const { perfTime } = require('../perfLog.cjs');
const { thinkIdFromTrashName, isTrashDeletion, META_READ_BATCH } = require('./helpers.cjs');

class VaultIndexing {
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
}

module.exports = { VaultIndexing };
