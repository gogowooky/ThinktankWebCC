'use strict';

/**
 * electron/vault/records.cjs
 * Think 1件の読み取り・保存・削除（楽観ロックと保存の直列化を含む）。
 * メソッドは electron/vaultEngine.cjs で VaultEngine.prototype に取り込む（this は VaultEngine）。
 */

const fs = require('fs');
const path = require('path');
const shared = require('../shared-dist/index.js');

class VaultRecords {
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
    if (payload.metadata !== undefined && payload.metadata !== null) {
      const metaObj =
        typeof payload.metadata === 'string'
          ? JSON.parse(payload.metadata)
          : payload.metadata;
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
      if (fs.existsSync(mdPath)) fs.renameSync(mdPath, this._trashPath(thinkid, 'deleted', '.md'));
      if (fs.existsSync(supPath)) fs.renameSync(supPath, this._trashPath(thinkid, 'deleted', '.support.json'));
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
}

module.exports = { VaultRecords };
