import { apiFetch } from './apiClient';
import type { ContextSnapshot } from './contextTypes';
import { readExternalLog, validateManifest, type ExternalInput, type ExternalLog, type ExportManifest } from '../../server/services/externalRecord';
import { object } from '../../server/services/conversationRecord';

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
async function parse(response: Response, bundleId: string): Promise<ExternalState> {
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error : '保存先との通信に失敗しました。');
  if (!object(value) || value.bundleId !== bundleId || typeof value.version !== 'string' || !Number.isFinite(Date.parse(value.version)) || !object(value.log)) throw new Error('取得結果の対象または版が不正です。');
  return { bundleId, version: value.version, log: readExternalLog(value.log, bundleId) };
}
export class ExternalService {
  async read(bundleId: string): Promise<ExternalState> {
    return parse(await apiFetch(`/api/think-support/external/bundles/${encodeURIComponent(bundleId)}`), bundleId);
  }
  async save(bundleId: string, version: string, operationId: string, input: ExternalInput): Promise<ExternalState> {
    return parse(await apiFetch(`/api/think-support/external/bundles/${encodeURIComponent(bundleId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: version, operationId, confirmed: true, input }),
    }), bundleId);
  }
}
