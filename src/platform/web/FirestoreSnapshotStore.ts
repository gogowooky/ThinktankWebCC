/**
 * FirestoreSnapshotStore.ts
 * Think のスナップショット（手動保存の版）と、最新版との差分。
 * purgeSnapshots は削除時に FirestoreStorageBackend から呼ぶので protected。
 */

import { isSafeThinkId } from '../../../shared/vaultFormat';
import { type FirestoreValue, type FirestoreDocument, type FirestoreListResponse, type ThinkSnapshotRecord, type ThinkDiffResult, encodeMetadata, firestoreErrorMessage, isPreconditionFailure, snapshotFromDocument } from './firestoreRest';
import { FirestoreDocumentStore } from './FirestoreDocumentStore';

export abstract class FirestoreSnapshotStore extends FirestoreDocumentStore {
  // ── スナップショット機能 ──────────────────────────────────────────

  /** 手動保存ごとに新規文書を作る。過去の snapshots/current も同じ一覧で読める。 */
  public async createSnapshot(thinkid: string): Promise<ThinkSnapshotRecord> {
    if (!isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    const ctx = await this.context();
    const parentName = `projects/${ctx.projectId}/databases/(default)/documents/users/${ctx.uid}/vaults/${this.vaultId}/thinks/${thinkid}`;
    const snapshotId = crypto.randomUUID();
    for (let attempt = 0; ; attempt++) {
      const record = await this.fetchDocument(thinkid);
      if (!record) throw new Error(`対象の Think「${thinkid}」が見つかりません。`);
      const snapshotAt = new Date().toISOString();
      const fields: Record<string, FirestoreValue> = {
        schemaVersion: { integerValue: '1' },
        thinkid: { stringValue: thinkid },
        title: { stringValue: record.meta.title },
        sourceUpdatedAt: { stringValue: record.meta.updatedAt },
        snapshotAt: { timestampValue: snapshotAt },
      };
      if (record.payloadParts) {
        // 大きな本文は元から版単位の不変ドキュメントに保存されている。
        fields.payloadParts = { mapValue: { fields: {
          revision: { stringValue: record.payloadParts.revision },
          count: { integerValue: String(record.payloadParts.count) },
        } } };
      } else {
        fields.body = { stringValue: record.body };
        fields.metadata = encodeMetadata(record.meta.metadata);
      }
      const name = `${parentName}/snapshots/${record.meta.updatedAt}_${snapshotId}`;
      // 同じコミットで親の版を照合する。取得後に削除されたThinkの下に履歴を作らない。
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(ctx.projectId)}/databases/(default)/documents:commit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
        body: JSON.stringify({ writes: [
          { update: { name: parentName, fields: { thinkid: fields.thinkid } }, updateMask: { fieldPaths: ['thinkid'] },
            currentDocument: { updateTime: record.firestoreUpdateTime } },
          { update: { name, fields }, currentDocument: { exists: false },
            updateTransforms: [{ fieldPath: 'snapshotAt', setToServerValue: 'REQUEST_TIME' }] },
        ] }),
      });
      const body = await this.readJson(response);
      if (response.ok) {
        const results = (body as { writeResults?: Array<{ transformResults?: FirestoreValue[] }> } | null)?.writeResults;
        return { thinkid, title: record.meta.title, body: record.body, metadata: record.meta.metadata ?? {},
          sourceUpdatedAt: record.meta.updatedAt, snapshotAt: results?.[1]?.transformResults?.[0]?.timestampValue ?? snapshotAt };
      }
      if (attempt < 2 && isPreconditionFailure(response.status, body)) continue;
      throw new Error(`スナップショットの保存に失敗しました (${firestoreErrorMessage(response.status, body)})`);
    }
  }

  private async *snapshotPages(thinkid: string, params: URLSearchParams): AsyncGenerator<FirestoreDocument[]> {
    if (!isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    const ctx = await this.context();
    const url = `${ctx.collectionUrl}/${encodeURIComponent(thinkid)}/snapshots`;
    for (;;) {
      const response = await fetch(`${url}?${params}`, { headers: ctx.authHeaders });
      if (response.status === 404) return;
      if (!response.ok) {
        const body = await this.readJson(response);
        throw new Error(`スナップショット一覧の取得に失敗しました (${firestoreErrorMessage(response.status, body)})`);
      }
      const page = (await response.json()) as FirestoreListResponse;
      yield page.documents ?? [];
      if (!page.nextPageToken) return;
      params.set('pageToken', page.nextPageToken);
    }
  }

  private async latestSnapshotDocument(thinkid: string): Promise<FirestoreDocument | null> {
    const params = new URLSearchParams({ pageSize: '1', orderBy: 'snapshotAt desc, __name__ desc' });
    for await (const docs of this.snapshotPages(thinkid, params)) {
      if (docs.length) return docs[0];
    }
    return null;
  }

  private async readSnapshot(thinkid: string, doc: FirestoreDocument): Promise<ThinkSnapshotRecord> {
    const snapshot = snapshotFromDocument(thinkid, doc);
    if (doc.fields?.payloadParts) {
      const record = await this.hydrateDocument(doc);
      if (!record) throw new Error('スナップショットの分割データが不正です。');
      snapshot.body = record.body;
      snapshot.metadata = record.meta.metadata ?? {};
    }
    return snapshot;
  }

  public async getSnapshot(thinkid: string): Promise<ThinkSnapshotRecord | null> {
    const doc = await this.latestSnapshotDocument(thinkid);
    return doc ? this.readSnapshot(thinkid, doc) : null;
  }

  /** 旧形式の current を含め、最古から最新の順で返す。 */
  public async listSnapshots(thinkid: string): Promise<ThinkSnapshotRecord[]> {
    const records: ThinkSnapshotRecord[] = [];
    const params = new URLSearchParams({ pageSize: '100', orderBy: 'snapshotAt asc, __name__ asc' });
    for await (const docs of this.snapshotPages(thinkid, params)) {
      for (const doc of docs) records.push(await this.readSnapshot(thinkid, doc));
    }
    return records;
  }

  private async removeSnapshotDocs(docs: FirestoreDocument[]): Promise<void> {
    if (!docs.length) return;
    const ctx = await this.context();
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(ctx.projectId)}/databases/(default)/documents:commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...ctx.authHeaders },
      body: JSON.stringify({ writes: docs.map(doc => ({
        delete: doc.name, currentDocument: { updateTime: doc.updateTime },
      })) }),
    });
    if (!response.ok) {
      const body = await this.readJson(response);
      throw new Error(`スナップショットの削除に失敗しました (${firestoreErrorMessage(response.status, body)})`);
    }
  }

  /** 一回の破棄で消すのは最新の一件。古い履歴はそのまま使える。 */
  public async deleteSnapshot(thinkid: string): Promise<void> {
    const doc = await this.latestSnapshotDocument(thinkid);
    if (doc) await this.removeSnapshotDocs([doc]);
  }

  /** 親の削除より古い履歴だけを小分けに消す。途中で失敗しても削除を再試行できる。 */
  protected async purgeSnapshots(thinkid: string, tombstoneTime: string): Promise<void> {
    // Firestore時刻はUTC・小数部0/3/6/9桁。文字列比較では末尾の Z を除くと順序が揃う。
    const cutoff = tombstoneTime.replace(/Z$/, '');
    const params = new URLSearchParams({ pageSize: '200', 'mask.fieldPaths': 'thinkid' });
    for await (const docs of this.snapshotPages(thinkid, params)) {
      const expired = docs.filter(doc => doc.updateTime && doc.updateTime.replace(/Z$/, '') <= cutoff);
      await this.removeSnapshotDocs(expired);
    }
  }

  /** 最新版とスナップショット版を比較して差分情報を取得する */
  public async getDiff(thinkid: string): Promise<ThinkDiffResult | null> {
    if (!isSafeThinkId(thinkid)) throw new Error(`不正な thinkid です: ${thinkid}`);
    const [latest, snapshot] = await Promise.all([
      this.fetchDocument(thinkid),
      this.getSnapshot(thinkid),
    ]);
    if (!latest || latest.meta.isDeleted || !snapshot) return null;

    const titleChanged = latest.meta.title !== snapshot.title;
    const bodyChanged = latest.body !== snapshot.body;
    const metadataChanged =
      JSON.stringify(latest.meta.metadata ?? {}) !== JSON.stringify(snapshot.metadata ?? {});
    const hasChanges = titleChanged || bodyChanged || metadataChanged;

    return {
      thinkid,
      hasChanges,
      titleChanged,
      bodyChanged,
      metadataChanged,
      latest: {
        title: latest.meta.title,
        body: latest.body,
        metadata: latest.meta.metadata ?? {},
        updatedAt: latest.meta.updatedAt,
      },
      snapshot,
    };
  }
}
