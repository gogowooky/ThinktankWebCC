// SSE ストリーミングチャット API ルート（/api/chat/messages）

import { Router } from 'express';
import { streamChatToResponse, type ChatMessage } from '../services/ChatService.ts';

export const chatRoutes = Router();

chatRoutes.post('/messages', async (req, res) => {
  const { messages, systemPrompt } = req.body ?? {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: 'messages must be an array' });
    return;
  }
  await streamChatToResponse(res, messages as ChatMessage[], String(systemPrompt ?? ''));
});
