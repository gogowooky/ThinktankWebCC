import { Router } from 'express';
import { bigqueryService, type BigQueryService } from '../services/BigQueryService.js';
import { id, object } from '../services/conversationRecord.js';
import { readProgress, validateProgress, sameProgress, progressReview, type ProgressEvent } from '../services/progressRecord.js';

class ProgressError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function createProgressRoutes(store: Pick<BigQueryService, 'getRecord' | 'saveThinkSupport'> = bigqueryService) {
  const router = Router();
  async function read(bundleId: string) {
    if (!id(bundleId)) throw new ProgressError(400, 'Bundle IDが不正です。');
    const result = await store.getRecord(bundleId);
    if (!result.success) throw new ProgressError(503, '保存先に接続できません。');
    const record = result.data;
    if (!record || record.category !== 'bundle' || record.is_deleted) throw new ProgressError(404, '保存済みBundleがありません。');
    const metadata: unknown = typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata ?? {};
    if (!object(metadata)) throw new ProgressError(422, 'メタデータが不正です。');
    const version = object(record.updated_at) && 'value' in record.updated_at ? String(record.updated_at.value) : String(record.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new ProgressError(422, '保存版を確認できません。');
    return { metadata, version, log: readProgress(metadata.thinkProgress) };
  }
  router.get('/bundles/:id', async (req, res) => {
    try {
      const bundleId = String(req.params.id); const { metadata, version, log } = await read(bundleId);
      res.json({ bundleId, version, log, review: progressReview(metadata, bundleId) });
    } catch (e) { res.status(e instanceof ProgressError ? e.status : 422).json({ error: e instanceof Error ? e.message : '記録を取得できません。' }); }
  });
  router.put('/bundles/:id', async (req, res) => {
    try {
      const bundleId = String(req.params.id);
      const { operationId, expectedVersion, confirmed, input } = req.body ?? {};
      if (!id(operationId) || confirmed !== true || typeof expectedVersion !== 'string' || !Number.isFinite(Date.parse(expectedVersion))) throw new ProgressError(400, '本人確認と保存版が必要です。');
      validateProgress(input);
      const { metadata, version, log } = await read(bundleId);
      const existing = log.events.find(e => e.id === operationId);
      if (existing) {
        if (!sameProgress(existing.input, input)) throw new ProgressError(409, '同じ操作IDの内容が異なります。');
        res.json({ bundleId, version, log, review: progressReview(metadata, bundleId) }); return;
      }
      if (expectedVersion !== version) throw new ProgressError(409, '保存競合です。最新記録と比較し、再確認してください。');
      if (log.events.length >= 100) throw new ProgressError(409, '履歴が100件に達しました。履歴を書き出し、別のBundleで続けてください。');
      const now = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
      const event: ProgressEvent = { id: operationId, revision: log.events.length + 1, confirmedAt: now, author: 'human', input };
      const next = { schemaVersion: 1 as const, events: [...log.events, event] };
      if (Buffer.byteLength(JSON.stringify(next)) > 2000000) throw new ProgressError(409, '履歴の容量上限です。履歴を書き出してください。');
      const result = await store.saveThinkSupport(bundleId, version, { ...metadata, thinkProgress: next }, now);
      if (!result.success) throw new ProgressError(503, '保存を確認できません。同じ入力のまま再試行できます。');
      if (!result.data) throw new ProgressError(409, '保存競合です。最新記録と比較し、再確認してください。');
      res.json({ bundleId, version: now, log: next, review: progressReview(metadata, bundleId) });
    } catch (e) { res.status(e instanceof ProgressError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  return router;
}
