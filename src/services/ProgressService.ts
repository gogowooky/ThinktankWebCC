import { apiFetch } from './apiClient';
import { readProgress, type ProgressInput, type ProgressLog, type ProgressReview } from '../../server/services/progressRecord';
import { object } from '../../server/services/conversationRecord';
export interface ProgressState { bundleId: string; version: string; log: ProgressLog; review: ProgressReview }
async function parse(response: Response, bundleId: string): Promise<ProgressState> {
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error : '保存先との通信に失敗しました。');
  if (!object(value) || value.bundleId !== bundleId || typeof value.version !== 'string' || !Number.isFinite(Date.parse(value.version))
    || !object(value.review) || !['goal', 'nextAction', 'completionCriteria'].every(k => typeof (value.review as Record<string, unknown>)[k] === 'string')
    || !Array.isArray(value.review.notes) || !value.review.notes.every(n => typeof n === 'string')) throw new Error('保存結果の形式または対象が一致しません。');
  readProgress(value.log); return value as unknown as ProgressState;
}
export class ProgressService {
  async read(bundleId: string): Promise<ProgressState> {
    return parse(await apiFetch(`/api/think-support/progress/bundles/${encodeURIComponent(bundleId)}`), bundleId);
  }
  async save(bundleId: string, version: string, operationId: string, input: ProgressInput): Promise<ProgressState> {
    return parse(await apiFetch(`/api/think-support/progress/bundles/${encodeURIComponent(bundleId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: version, operationId, input, confirmed: true }),
    }), bundleId);
  }
}
