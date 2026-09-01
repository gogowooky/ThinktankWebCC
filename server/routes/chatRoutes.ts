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
import { isAllowedAiModel } from '../config/aiModels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

export function createChatRoutes(): Router {
  const router = Router();

  // クライアントの AI モデル選択ドロップダウンが、API キー未設定のプロバイダを
  // 表示しないようにするための可用性チェック。判定基準は /messages と同じ環境変数。
  router.get('/providers', (_req, res) => {
    res.json({
      anthropic: Boolean(process.env['ANTHROPIC_API_KEY']),
      openai:    Boolean(process.env['OPENAI_API_KEY']),
      gemini:    Boolean(process.env['GEMINI_API_KEY']),
    });
  });

  router.post('/messages', async (req, res) => {
    const { messages, systemPrompt = '', provider, model } = req.body as {
      messages: ChatRequestMessage[];
      systemPrompt?: string;
      provider?: unknown;
      model?: unknown;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array required' });
      return;
    }

    // provider/model はクライアントの AI モデル選択ドロップダウンから送られる。
    // 任意の文字列をそのまま各SDKへ渡すと、存在しないモデルIDでの404や
    // 意図しない高額モデルの指定を許してしまうため、許可リストで検証する。
    let requestedProvider: string | undefined;
    let requestedModel: string | undefined;
    if (provider !== undefined || model !== undefined) {
      if (!isAllowedAiModel(provider, model)) {
        res.status(400).json({ error: 'unsupported provider/model' });
        return;
      }
      requestedProvider = provider as string;
      requestedModel = model as string;
    }

    const activeProvider = requestedProvider || process.env['AI_PROVIDER'] || 'anthropic';
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
      ? `${thinktankConfig}\n\n【指示】\n上記はあなたのタスク定義と行動ガイドラインです。これらに従って動作してください。現在の追加プロンプト：\n${systemPrompt}`
      : systemPrompt;

    await streamChatResponse(messages, finalSystemPrompt, res, requestedProvider, requestedModel);
  });

  return router;
}
