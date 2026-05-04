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
  signal?: AbortSignal,
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }, { signal });

    for await (const event of stream) {
      if (signal?.aborted) break;
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`);
      }
    }

    if (!signal?.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    }
  } catch (err) {
    if (signal?.aborted) return;
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ChatService] stream error:', message);
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
  } finally {
    res.end();
  }
}
