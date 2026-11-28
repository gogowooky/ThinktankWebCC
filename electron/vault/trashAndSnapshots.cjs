'use strict';

/**
 * electron/vault/trashAndSnapshots.cjs
 * trash/ への退避、移行で手元より新しい版の取り込み、ローカル運用のスナップショット。
 * メソッドは electron/vaultEngine.cjs で VaultEngine.prototype に取り込む（this は VaultEngine）。
 */

const fs = require('fs');
const path = require('path');
const shared = require('../shared-dist/index.js');
const { fileTimestamp, readJsonFile } = require('./helpers.cjs');

class VaultTrashAndSnapshots {
  /**
   * ローカル運用では、消す・上書きされる版を trash/ へ日時付きで退避する。
   * 同じ Think を何度消しても前の退避を上書きしない（同期フォルダ上でのファイル消失対策）。
   */
  _trashPath(thinkid, reason, ext) {
    // 日時はミリ秒までなので、同じミリ秒に続けて退避すると名前が重なり前の退避を上書きしてしまう。
    const base = path.join(this.getTrashDir(), `${thinkid}.${reason}-${fileTimestamp()}`);
    let candidate = `${base}${ext}`;
    for (let n = 1; fs.existsSync(candidate); n += 1) candidate = `${base}-${n}${ext}`;
    return candidate;
  }

  /** 現在の .md / .support.json を消さずに trash/ へ写す（移行で上書きされる側を残す）。 */
  stashCurrentVersion(thinkid, reason = 'overwritten') {
    const mdPath = this._mdPath(thinkid);
    if (!fs.existsSync(mdPath)) return false;
    fs.mkdirSync(this.getTrashDir(), { recursive: true });
    fs.copyFileSync(mdPath, this._trashPath(thinkid, reason, '.md'));
    const supPath = this._supportPath(thinkid);
    if (fs.existsSync(supPath)) fs.copyFileSync(supPath, this._trashPath(thinkid, reason, '.support.json'));
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
    this._atomicWrite(this._trashPath(thinkid, reason, '.md'), mdText);
    if (shared.hasNonEmptyMetadata(meta.metadata)) {
      this._atomicWrite(
        this._trashPath(thinkid, reason, '.support.json'),
        shared.serializeSupportFile({ thinkid, updatedAt: meta.updatedAt, metadata: meta.metadata }),
      );
    }
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
    fs.renameSync(filePath, this._trashPath(thinkid, 'snapshot', '.json'));
  }
}

module.exports = { VaultTrashAndSnapshots };
