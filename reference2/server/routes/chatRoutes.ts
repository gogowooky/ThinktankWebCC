/**
 * chatRoutes.ts
 * チャットAPI - SSEストリーミング対応
 *
 * POST /api/chat/:sessionId/messages
 *   リクエスト: { message, history, systemPrompt? }
 *   レスポンス: SSE (text/event-stream)
 */

import { Router, Request, Response } from 'express';
import { chatService, ChatTurn } from '../services/ChatService.js';

export function createChatRoutes(): Router {
  const router = Router();

  // POST /api/chat/:sessionId/messages - ストリーミングチャット
  router.post('/:sessionId/messages', async (req: Request, res: Response) => {
    if (!chatService.isAvailable()) {
      res.status(503).json({ error: 'Chat API not available. Set ANTHROPIC_API_KEY.' });
      return;
    }

    const { message, history, systemPrompt } = req.body as {
      message?: string;
      history?: ChatTurn[];
      systemPrompt?: string;
    };

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    // 会話履歴を構築（最新メッセージを末尾に追加）
    const messages: ChatTurn[] = [
      ...(history || []),
      { role: 'user', content: message },
    ];

    // SSEヘッダー
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const chunk of chatService.streamMessage(messages, systemPrompt)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[ChatRoutes] Stream error:', msg);
      res.write(`data: ${JSON.stringify({ type: 'error', text: msg })}\n\n`);
    }
    res.end();
  });

  return router;
}
