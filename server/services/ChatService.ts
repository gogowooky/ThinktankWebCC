/**
 * ChatService.ts
 * Phase 14: Anthropic Claude API を使った SSE ストリーミングチャット。
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';

const MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6';

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChatResponse(
  messages: ChatRequestMessage[],
  systemPrompt: string,
  res: Response,
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeSSE = (payload: object): boolean => {
    if (res.writableEnded) return false;
    return res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    // .on('text') で逐次テキストデルタを受け取る
    stream.on('text', (textDelta) => {
      writeSSE({ type: 'delta', text: textDelta });
    });

    // ストリーム完了まで待つ
    await stream.finalMessage();

    writeSSE({ type: 'done' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ChatService] stream error:', message);
    writeSSE({ type: 'error', message });
  } finally {
    res.end();
  }
}
