import type { BigQueryService } from './BigQueryService.js';
import { canonicalJson, id, object } from './conversationRecord.js';
import { FileSearchError, type FileSearchProvider } from './FileSearchProvider.js';
import { latestBinding, readBindingLog, validateBindingInput, type BindingInput, type BindingLog, type BindingState } from './fileSearchBindingRecord.js';

export class FileSearchBindingService {
  constructor(private readonly store: Pick<BigQueryService, 'getRecord' | 'saveThinkSupport'>, private readonly provider: FileSearchProvider) {}
  private async load(bundleId: string) {
    if (!id(bundleId)) throw new FileSearchError(400, 'Bundle IDが不正です。');
    const result = await this.store.getRecord(bundleId);
    if (!result.success) throw new FileSearchError(503, '保存先に接続できません。');
    const record = result.data;
    if (!record || record.is_deleted || record.category !== 'bundle') throw new FileSearchError(404, '保存済みBundleがありません。');
    const metadata: unknown = typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata ?? {};
    if (!object(metadata)) throw new FileSearchError(422, 'メタデータが不正です。');
    const version = object(record.updated_at) ? String(record.updated_at.value) : String(record.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new FileSearchError(422, '保存版を確認できません。');
    return { metadata, version, log: readBindingLog(metadata.thinkFileSearch) };
  }
  async read(bundleId: string): Promise<BindingState> {
    const { version, log } = await this.load(bundleId); return { bundleId, version, log };
  }
  async save(bundleId: string, expectedVersion: string, operationId: string, input: BindingInput, signal?: AbortSignal): Promise<BindingState> {
    if (!id(operationId) || typeof expectedVersion !== 'string' || !Number.isFinite(Date.parse(expectedVersion))) throw new FileSearchError(400, '操作IDと保存版が必要です。');
    validateBindingInput(input);
    const { metadata, version, log } = await this.load(bundleId);
    const existing = log.events.find(e => e.id === operationId);
    if (existing) {
      if (canonicalJson(existing.input) !== canonicalJson(input)) throw new FileSearchError(409, '同じ操作IDの内容が異なります。');
      return { bundleId, version, log };
    }
    if (version !== expectedVersion) throw new FileSearchError(409, '保存競合です。登録済み対応を再取得し、確認してください。');
    const previous = latestBinding(log, input.vaultId, input.connectionId)?.input.storeName ?? null;
    if (previous !== input.previousStoreName) throw new FileSearchError(409, '変更前のストア対応が一致しません。再取得してください。');
    if (log.events.length >= 100) throw new FileSearchError(409, 'ストア対応履歴が100件に達しました。自動削除は行いません。');
    if (input.storeName === null && previous === null) throw new FileSearchError(409, '解除するストア対応がありません。');
    // A client-supplied display name or old listing cannot prove the exact store is still accessible.
    const verification = input.storeName === null ? null : await this.provider.getStore(input.connectionId, input.storeName, signal);
    if (signal?.aborted) throw new FileSearchError(409, '確認を中断しました。保存結果を再取得してください。');
    const now = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
    const next: BindingLog = { schemaVersion: 1, events: [...log.events, { id: operationId, recordedAt: now, input, verification }] };
    readBindingLog(next);
    if (Buffer.byteLength(JSON.stringify(next)) > 2000000) throw new FileSearchError(409, 'ストア対応履歴の容量上限です。');
    const saved = await this.store.saveThinkSupport(bundleId, version, { ...metadata, thinkFileSearch: next }, now);
    if (!saved.success) throw new FileSearchError(503, '保存結果が不明です。入力を変えず再試行できます。');
    if (!saved.data) throw new FileSearchError(409, '保存競合です。登録済み対応を再取得してください。');
    return { bundleId, version: now, log: next };
  }
}
