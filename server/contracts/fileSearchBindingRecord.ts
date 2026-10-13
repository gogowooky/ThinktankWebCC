import { id, object, text } from './conversationRecord.js';
import { parseFileSearchPage, storeName, type FileSearchPage } from './fileSearchRecord.js';

export interface BindingInput { vaultId: string; connectionId: string; storeName: string | null; previousStoreName: string | null }
export interface BindingEvent { id: string; recordedAt: string; input: BindingInput; verification: FileSearchPage | null }
export interface BindingLog { schemaVersion: 1; events: BindingEvent[] }
export interface BindingState { bundleId: string; version: string; log: BindingLog }
export function validateBindingInput(value: unknown): asserts value is BindingInput {
  if (!object(value) || Object.keys(value).some(k => !['vaultId', 'connectionId', 'storeName', 'previousStoreName'].includes(k))
    || !id(value.vaultId) || !id(value.connectionId) || (value.storeName !== null && !storeName(value.storeName))
    || (value.previousStoreName !== null && !storeName(value.previousStoreName))) throw new Error('ストア対応の入力が不正です。');
}
export function readBindingLog(value: unknown): BindingLog {
  if (value === undefined) return { schemaVersion: 1, events: [] };
  if (!object(value) || value.schemaVersion !== 1 || Object.keys(value).some(k => !['schemaVersion', 'events'].includes(k))
    || !Array.isArray(value.events) || value.events.length > 100) throw new Error('ストア対応履歴が未対応または不正です。');
  const ids = new Set<string>();
  for (const event of value.events) {
    if (!object(event) || !id(event.id) || ids.has(event.id) || Object.keys(event).some(k => !['id', 'recordedAt', 'input', 'verification'].includes(k))
      || !text(event.recordedAt, 40) || !Number.isFinite(Date.parse(event.recordedAt))) throw new Error('ストア対応履歴が不正です。');
    validateBindingInput(event.input); ids.add(event.id);
    if (event.input.storeName === null) {
      if (event.verification !== null) throw new Error('解除記録に外部確認結果は指定できません。');
    } else {
      const page = parseFileSearchPage(event.verification, event.input.connectionId);
      if (page.stores.length !== 1 || page.stores[0].name !== event.input.storeName || page.nextPageToken !== null) throw new Error('ストア確認結果が一致しません。');
    }
  }
  return value as unknown as BindingLog;
}
export function latestBinding(log: BindingLog, vaultId: string, connectionId: string): BindingEvent | undefined {
  return [...log.events].reverse().find(e => e.input.vaultId === vaultId && e.input.connectionId === connectionId);
}
