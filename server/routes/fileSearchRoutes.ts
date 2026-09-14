import { Router } from 'express';
import { configuredFileSearchProvider, FileSearchError, type FileSearchProvider } from '../services/FileSearchProvider.js';
import { id } from '../services/conversationRecord.js';
import { validPageToken } from '../services/fileSearchRecord.js';
import { FileSearchBindingService } from '../services/FileSearchBindingService.js';
import { bigqueryService } from '../services/BigQueryService.js';

export function createFileSearchRoutes(provider: FileSearchProvider = configuredFileSearchProvider(), bindings: Pick<FileSearchBindingService, 'read' | 'save'> = new FileSearchBindingService(bigqueryService, provider)) {
  const router = Router();
  router.get('/bundles/:id/binding', async (req, res) => {
    try { res.set('Cache-Control', 'no-store').json(await bindings.read(String(req.params.id))); }
    catch (e) { res.status(e instanceof FileSearchError ? e.status : 422).json({ error: e instanceof FileSearchError ? e.message : 'ストア対応を読み取れません。' }); }
  });
  router.put('/bundles/:id/binding', async (req, res) => {
    const controller = new AbortController(); const close = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', close);
    try {
      const { confirmed, expectedVersion, operationId, input } = req.body ?? {};
      if (confirmed !== true) throw new FileSearchError(400, 'ストア対応の本人確認が必要です。');
      res.set('Cache-Control', 'no-store').json(await bindings.save(String(req.params.id), expectedVersion, operationId, input, controller.signal));
    } catch (e) { if (!res.destroyed) res.status(e instanceof FileSearchError ? e.status : 422).json({ error: e instanceof FileSearchError ? e.message : 'ストア対応を保存できません。' }); }
    finally { res.off('close', close); }
  });
  router.get('/status', (_req, res) => { res.set('Cache-Control', 'no-store').json(provider.status()); });
  router.get('/stores', async (req, res) => {
    const controller = new AbortController();
    const close = () => { if (!res.writableEnded) controller.abort(); }; res.on('close', close);
    try {
      const { connectionId, pageToken = '' } = req.query;
      if (!id(connectionId) || !validPageToken(pageToken)) throw new FileSearchError(400, '接続先またはページ指定が不正です。');
      res.set('Cache-Control', 'no-store').json(await provider.listStores(connectionId, pageToken, controller.signal));
    } catch (e) {
      if (!res.destroyed) res.status(e instanceof FileSearchError ? e.status : 502).json({ error: e instanceof FileSearchError ? e.message : 'File Searchの一覧を取得できません。' });
    } finally { res.off('close', close); }
  });
  return router;
}
