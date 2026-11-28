'use strict';

/**
 * electron/vault/search.cjs
 * 本文検索と、その準備（本文パックの読み込み）。
 * メソッドは electron/vaultEngine.cjs で VaultEngine.prototype に取り込む（this は VaultEngine）。
 */

const fs = require('fs');
const path = require('path');
const shared = require('../shared-dist/index.js');

class VaultSearch {
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
}

module.exports = { VaultSearch };
