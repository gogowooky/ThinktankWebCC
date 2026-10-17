import { BundleRepository, nextRecordVersion } from './BundleRepository.js';
import type { VaultStore } from './vaultStore.js';
import { canonicalJson, id } from './conversationRecord.js';
import { FileSearchError, type FileSearchProvider } from './FileSearchProvider.js';
import { latestBinding, readBindingLog, validateBindingInput, type BindingInput, type BindingLog, type BindingState } from './fileSearchBindingRecord.js';

export class FileSearchBindingService {
  private readonly bundles: BundleRepository;
  constructor(store: Pick<VaultStore, 'getRecord' | 'saveThinkSupport'>, private readonly provider: FileSearchProvider) {
    this.bundles = new BundleRepository(store, FileSearchError);
  }
  private async load(bundleId: string) {
    const { metadata, version } = await this.bundles.read(bundleId);
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
    const now = nextRecordVersion(version);
    const next: BindingLog = { schemaVersion: 1, events: [...log.events, { id: operationId, recordedAt: now, input, verification }] };
    readBindingLog(next);
    if (Buffer.byteLength(JSON.stringify(next)) > 2000000) throw new FileSearchError(409, 'ストア対応履歴の容量上限です。');
    const saved = await this.bundles.save(bundleId, version, { ...metadata, thinkFileSearch: next }, now);
    if (!saved.success) throw new FileSearchError(503, '保存結果が不明です。入力を変えず再試行できます。');
    if (!saved.data) throw new FileSearchError(409, '保存競合です。登録済み対応を再取得してください。');
    return { bundleId, version: now, log: next };
  }
}
