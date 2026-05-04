/**
 * chatRoutes.ts
 * Phase 14: POST /api/chat/messages — SSE ストリーミングチャット API。
 */

import { Router } from 'express';
import { streamChatResponse } from '../services/ChatService.js';
import type { ChatRequestMessage } from '../services/ChatService.js';

export function createChatRoutes(): Router {
  const router = Router();

  router.post('/messages', async (req, res) => {
    const { messages, systemPrompt = '' } = req.body as {
      messages: ChatRequestMessage[];
      systemPrompt?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array required' });
      return;
    }

    if (!process.env['ANTHROPIC_API_KEY']) {
      res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
      return;
    }

    const ac = new AbortController();
    req.on('close', () => ac.abort());

    await streamChatResponse(messages, systemPrompt, res, ac.signal);
  });

  return router;
}
