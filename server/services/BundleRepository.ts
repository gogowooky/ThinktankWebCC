import type { BigQueryService } from './BigQueryService.js';
import { decodeMetadata } from './metadataCodec.js';
import { id, object } from '../contracts/conversationRecord.js';

export type BundleStore = Pick<BigQueryService, 'getRecord' | 'saveThinkSupport'>;
export type RecordError = new (status: number, message: string) => Error;
interface ReadMessages { unavailable: string; missing: string; metadata: string }
const defaultMessages: ReadMessages = {
  unavailable: '保存先に接続できません。',
  missing: '保存済みBundleがありません。',
  metadata: 'メタデータが不正です。',
};

export function storedVersion(value: unknown): string {
  return object(value) && 'value' in value ? String(value.value) : String(value);
}

export function nextRecordVersion(version: string): string {
  return new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
}

/** 読取時の削除・形式検証を揃え、各機能は履歴の検証と競合時の再試行方針を持つ。 */
export class BundleRepository {
  private readonly messages: ReadMessages;
  constructor(
    private readonly store: BundleStore,
    private readonly ErrorType: RecordError,
    messages: Partial<ReadMessages> = {},
    private readonly cloneMetadata = false,
  ) { this.messages = { ...defaultMessages, ...messages }; }

  async read(bundleId: string) {
    if (!id(bundleId)) throw new this.ErrorType(400, 'Bundle IDが不正です。');
    const result = await this.store.getRecord(bundleId);
    if (!result.success) throw new this.ErrorType(503, this.messages.unavailable);
    const record = result.data;
    if (!record || record.category !== 'bundle' || record.is_deleted) throw new this.ErrorType(404, this.messages.missing);
    const decoded: unknown = decodeMetadata(record.metadata) ?? {};
    const metadata = this.cloneMetadata ? structuredClone(decoded) : decoded;
    if (!object(metadata)) throw new this.ErrorType(422, this.messages.metadata);
    const version = storedVersion(record.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new this.ErrorType(422, '保存版を確認できません。');
    return { record, metadata, version };
  }

  save(bundleId: string, expectedVersion: string, metadata: object, updatedAt: string) {
    return this.store.saveThinkSupport(bundleId, expectedVersion, metadata, updatedAt);
  }
}
