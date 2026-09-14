/** AI-neutral boundary: never load provider SDKs or execute chat requests. */
import { Router } from 'express';

export function createChatRoutes(): Router {
  const router = Router();
  router.get('/providers', (_req, res) => {
    res.json({ anthropic: false, openai: false, gemini: false });
  });
  router.post('/messages', (_req, res) => {
    res.status(503).json({ code: 'AI_DISABLED', error: 'AI execution is disabled; stored conversations are preserved.' });
  });
  return router;
}
