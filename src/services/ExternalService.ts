import type { ContextSnapshot } from './contextTypes';
import { readExternalLog, validateExternalInput, validateManifest, type ExternalInput, type ExternalLog, type ExportManifest } from '../../shared/contracts/externalRecord';
import { canonicalJson, id } from '../../shared/contracts/conversationRecord';
import { readBundleMetadata, saveBundleMetadata } from './bundleMetadataStore';
import { StorageConflictError } from './storage/IStorageBackend';

export interface ExternalState { bundleId: string; version: string; log: ExternalLog }
export async function prepareExport(snapshot: ContextSnapshot): Promise<{ manifest: ExportManifest; files: { name: string; content: string }[] }> {
  if (snapshot.sources.reduce((n, s) => n + s.content.length, 0) > 120000) throw new Error('資料が大きすぎます。Bundleを分けてください。');
  const manifest: ExportManifest = {
    schemaVersion: 1, snapshotId: snapshot.snapshotId, vaultId: snapshot.vaultId, bundleId: snapshot.bundleId,
    capturedAt: snapshot.capturedAt, normalizationVersion: 'exact-utf8-v1', status: 'prepared', quality: snapshot.quality,
    sources: snapshot.sources.map(s => ({ thinkId: s.thinkId, title: s.title, filename: `${s.thinkId}.md`, contentHash: s.contentHash,
      observedUpdatedAt: s.observedUpdatedAt, hasUnsavedChanges: s.hasUnsavedChanges })),
    issues: snapshot.issues.map(i => `${i.thinkId}: ${i.message}`),
  };
  validateManifest(manifest);
  // Files contain exactly the bytes hashed by P1: no added headers, BOM, or newline conversion.
  for (const source of snapshot.sources) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.content));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== source.contentHash) throw new Error('資料のハッシュが一致しません。再取得してください。');
  }
  return { manifest, files: snapshot.sources.map(s => ({ name: `${s.thinkId}.md`, content: s.content })) };
}
export class ExternalService {
  async read(bundleId: string): Promise<ExternalState> {
    const { metadata, version } = await readBundleMetadata(bundleId);
    return { bundleId, version, log: readExternalLog(metadata.thinkExternal, bundleId) };
  }
  async save(bundleId: string, version: string, operationId: string, input: ExternalInput): Promise<ExternalState> {
    if (!id(operationId) || !Number.isFinite(Date.parse(version))) throw new Error('本人確認と保存版が必要です。');
    validateExternalInput(input, bundleId);
    const current = await this.read(bundleId);
    // 応答を失った後の再試行は、同じ操作IDかつ同じ内容なら保存済みとして返す
    const existing = current.log.events.find(e => e.id === operationId);
    if (existing) {
      if (canonicalJson(existing.input) !== canonicalJson(input)) throw new Error('同じ操作IDの内容が異なります。');
      return current;
    }
    if (current.version !== version) throw new Error('保存競合です。登録済み記録を再取得し、比較・再確認してください。');
    if (current.log.events.length >= 100) throw new Error('履歴が100件に達しました。自動削除は行いません。');
    const next: ExternalLog = { schemaVersion: 1, events: [...current.log.events, { id: operationId, recordedAt: new Date().toISOString(), input }] };
    if (new TextEncoder().encode(JSON.stringify(next)).length > 2000000) throw new Error('履歴の容量上限です。');
    try {
      const saved = await saveBundleMetadata(bundleId, version, { thinkExternal: next });
      return { bundleId, version: saved.version, log: next };
    } catch (e) {
      if (e instanceof StorageConflictError) throw Object.assign(new Error('保存競合です。登録済み記録を再取得してください。'), { cause: e });
      throw e;
    }
  }
}
