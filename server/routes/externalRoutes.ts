import { Router } from 'express';
import { BundleRepository, nextRecordVersion } from '../services/BundleRepository.js';
import { unavailableVaultStore, type VaultStore } from '../services/vaultStore.js';
import { canonicalJson, id } from '../services/conversationRecord.js';
import { readExternalLog, validateExternalInput, type ExternalLog } from '../services/externalRecord.js';

class ExternalError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export function createExternalRoutes(store: Pick<VaultStore, 'getRecord' | 'saveThinkSupport'> = unavailableVaultStore) {
  const router = Router();
  const bundles = new BundleRepository(store, ExternalError);
  async function read(bundleId: string) {
    const { metadata, version } = await bundles.read(bundleId);
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
      const now = nextRecordVersion(version);
      const next: ExternalLog = { schemaVersion: 1, events: [...log.events, { id: operationId, recordedAt: now, input }] };
      if (Buffer.byteLength(JSON.stringify(next)) > 2000000) throw new ExternalError(409, '履歴の容量上限です。');
      const saved = await bundles.save(bundleId, version, { ...metadata, thinkExternal: next }, now);
      if (!saved.success) throw new ExternalError(503, '保存結果が不明です。入力を変えず再試行できます。');
      if (!saved.data) throw new ExternalError(409, '保存競合です。登録済み記録を再取得してください。');
      res.json({ bundleId, version: now, log: next });
    } catch (e) { res.status(e instanceof ExternalError ? e.status : 422).json({ error: e instanceof Error ? e.message : '保存できません。' }); }
  });
  return router;
}
