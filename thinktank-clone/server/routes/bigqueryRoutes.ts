// ストレージ連携 API ルート（/api/bq/files/*）
// クローン環境では BigQuery の代わりにローカルJSONストアで同一のAPI形状を提供する。

import { Router } from 'express';
import * as store from '../services/FileStoreService.ts';

export const bigqueryRoutes = Router();

bigqueryRoutes.get('/files/meta', async (_req, res) => {
  try {
    res.json(await store.listMeta());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

bigqueryRoutes.get('/files/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '');
    res.json(await store.search(q));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

bigqueryRoutes.get('/files/:id/content', async (req, res) => {
  try {
    const content = await store.getContent(req.params.id);
    if (content === null) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

bigqueryRoutes.post('/files', async (req, res) => {
  try {
    const { id, contentType, fullContent, keywords, relatedIds } = req.body ?? {};
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const meta = await store.save({
      id,
      contentType: contentType ?? 'memo',
      fullContent: fullContent ?? '',
      keywords: keywords ?? '',
      relatedIds: relatedIds ?? '',
    });
    res.json(meta);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

bigqueryRoutes.delete('/files/:id', async (req, res) => {
  try {
    await store.remove(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
