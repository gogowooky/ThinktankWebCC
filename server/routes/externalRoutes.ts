import { Router } from 'express';
import { bigqueryService, type BigQueryService } from '../services/BigQueryService.js';
import { canonicalJson, id, object } from '../services/conversationRecord.js';
import { readExternalLog, validateExternalInput, type ExternalLog } from '../services/externalRecord.js';

class ExternalError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function createExternalRoutes(store: Pick<BigQueryService, 'getRecord' | 'saveThinkSupport'> = bigqueryService) {
  const router = Router();
  async function read(bundleId: string) {
    if (!id(bundleId)) throw new ExternalError(400, 'Bundle IDが不正です。');
    const result = await store.getRecord(bundleId);
    if (!result.success) throw new ExternalError(503, '保存先に接続できません。');
    const record = result.data;
    if (!record || record.category !== 'bundle' || record.is_deleted) throw new ExternalError(404, '保存済みBundleがありません。');
    const metadata: unknown = typeof record.metadata === 'string' ? JSON.parse(record.metadata) : record.metadata ?? {};
    if (!object(metadata)) throw new ExternalError(422, 'メタデータが不正です。');
    const version = object(record.updated_at) ? String(record.updated_at.value) : String(record.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new ExternalError(422, '保存版を確認できません。');
    return { metadata, version, log: readExternalLog(metadata.thinkExternal, bundleId) };
  }
  router.get('/bundles/:id', async (req, res) => {
    try { const bundleId = String(req.params.id); const { version, log } = await read(bundleId); res.json({ bundleId, version, log }); }
    catch (e) { res.status(e instanceof ExternalError ? e.status : 422).json({ error: e instanceof Error ? e.message : '取得できません。' }); }
  });
  router.put('/bundles/:id', async (req, res) => {
    try {
      const bundleId = String(req.params.id);
      const { expectedVersion, operationId, confirmed, input } = req.body ?? {};
      if (!id(operationId) || confirmed !== true || typeof expectedVersion !== 'string' || !Number.isFinite(Date.parse(expectedVersion))) throw new ExternalError(400, '本人確認と保存版が必要です。');
      validateExternalInput(input, bundleId);
      const { metadata, version, log } = await read(bundleId);
      const existing = log.events.find(e => e.id === operationId);
      if (existing) {
        if (canonicalJson(existing.input) !== canonicalJson(input)) throw new ExternalError(409, '同じ操作IDの内容が異なります。');
        res.json({ bundleId, version, log }); return;
      }
      if (version !== expectedVersion) throw new ExternalError(409, '保存競合です。登録済み記録を再取得し、比較・再確認してください。');
      if (log.events.length >= 100) throw new ExternalError(409, '履歴が100件に達しました。自動削除は行いません。');
      const now = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
      const next: ExternalLog = { schemaVersion: 1, events: [...log.events, { id: operationId, recordedAt: now, input }] };
      if (Buffer.byteLength(JSON.stringify(next)) > 2000000) throw new ExternalError(409, '履歴の容量上限です。');
      const saved = await store.saveThinkSupport(bundleId, version, { ...metadata, thinkExternal: next }, now);
      if (!saved.success) throw new ExternalError(503, '保存結果が不明です。入力を変えず再試行できます。');
      if (!saved.data) throw new ExternalError(409, '保存競合です。登録済み記録を再取得してください。');
      res.json({ bundleId, version: now, log: next });
    } catch (e) { res.status(e instanceof ExternalError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  return router;
}
