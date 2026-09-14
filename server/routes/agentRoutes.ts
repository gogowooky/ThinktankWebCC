import { Router } from 'express';
import { AgentService, AgentError } from '../services/AgentService.js';
import { configuredProvider } from '../services/AIProvider.js';
import { bigqueryService } from '../services/BigQueryService.js';
import { id } from '../services/conversationRecord.js';

export function createAgentRoutes(service = new AgentService(configuredProvider(), bigqueryService)) {
  const router = Router();
  router.get('/status', (_req, res) => { res.json(service.status()); });
  router.get('/bundles/:id', async (req, res) => {
    try { const bundleId = String(req.params.id); const { version, log } = await service.read(bundleId); res.json({ bundleId, version, log }); }
    catch (e) { res.status(e instanceof AgentError ? e.status : 422).json({ error: e instanceof Error ? e.message : 'ジョブを取得できません。' }); }
  });
  router.post('/jobs', async (req, res) => {
    try {
      const { jobId, kind, instruction, context, confirmed } = req.body ?? {};
      if (confirmed !== true) throw new AgentError(400, '処理範囲の本人確認が必要です。');
      res.json(await service.create(jobId, kind, instruction, context));
    } catch (e) { res.status(e instanceof AgentError ? e.status : 422).json({ error: e instanceof Error ? e.message : 'ジョブを登録できません。' }); }
  });
  router.get('/bundles/:id/jobs/:jobId/artifact', async (req, res) => {
    try { res.json(await service.readArtifact(String(req.params.id), String(req.params.jobId))); }
    catch (e) { res.status(e instanceof AgentError ? e.status : 422).json({ error: e instanceof Error ? e.message : '成果物を取得できません。' }); }
  });
  router.post('/bundles/:id/jobs/:jobId/:action', async (req, res) => {
    const controller = new AbortController();
    const close = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', close);
    try {
      const bundleId = String(req.params.id), jobId = String(req.params.jobId), action = String(req.params.action);
      if (!id(bundleId) || !id(jobId)) throw new AgentError(400, '対象IDが不正です。');
      const { confirmed, retry, expectedVersion, contentHash } = req.body ?? {};
      if (confirmed !== true) throw new AgentError(400, '操作の本人確認が必要です。');
      if (action === 'run') res.json(await service.run(bundleId, jobId, retry === true, controller.signal));
      else if (action === 'cancel') res.json(await service.cancel(bundleId, jobId));
      else if (action === 'apply') res.json(await service.apply(bundleId, jobId, expectedVersion, contentHash));
      else throw new AgentError(404, '未対応の操作です。');
    } catch (e) { if (!res.destroyed) res.status(e instanceof AgentError ? e.status : 422).json({ error: e instanceof Error ? e.message : '処理に失敗しました。' }); }
    finally { res.off('close', close); }
  });
  return router;
}
