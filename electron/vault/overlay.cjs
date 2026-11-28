'use strict';

/**
 * electron/vault/overlay.cjs
 * 一覧の記録（メタデータの上書き分）の読み書き。本体ファイルと追記ジャーナルを合わせて使う。
 * メソッドは electron/vaultEngine.cjs で VaultEngine.prototype に取り込む（this は VaultEngine）。
 */

const fs = require('fs');
const { OVERLAY_JOURNAL_MAX_BYTES } = require('./helpers.cjs');

class VaultOverlay {
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
}

module.exports = { VaultOverlay };
