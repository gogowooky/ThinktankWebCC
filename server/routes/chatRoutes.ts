/**
 * chatRoutes.ts
 * Phase 14: POST /api/chat/messages — SSE ストリーミングチャット API。
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { streamChatResponse } from '../services/ChatService.js';
import type { ChatRequestMessage } from '../services/ChatService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

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

    const activeProvider = process.env['AI_PROVIDER'] || 'anthropic';
    if (activeProvider === 'anthropic' && !process.env['ANTHROPIC_API_KEY']) {
      res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
      return;
    }
    if (activeProvider === 'gemini' && !process.env['GEMINI_API_KEY']) {
      res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }
    if (activeProvider === 'openai' && !process.env['OPENAI_API_KEY']) {
      res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    const configPath = path.join(projectRoot, '.thinktank/thinktank.md');
    let thinktankConfig = '';
    try {
      if (fs.existsSync(configPath)) {
        thinktankConfig = fs.readFileSync(configPath, 'utf8');
      }
    } catch (e) {
      console.error('[chatRoutes] Failed to read thinktank config:', e);
    }

    const finalSystemPrompt = thinktankConfig
      ? `${thinktankConfig}\n\n[Instructions]\nAbove is the definition of your task and behavior guidelines. Please act according to these instructions. Current system prompt:\n${systemPrompt}`
      : systemPrompt;

    await streamChatResponse(messages, finalSystemPrompt, res);
  });

  return router;
}
