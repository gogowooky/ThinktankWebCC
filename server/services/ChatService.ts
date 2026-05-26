/**
 * ChatService.ts
 * 複数の AI プロバイダー (Anthropic Claude, OpenAI, Google Gemini) をサポートする
 * SSE ストリーミングチャット。
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Response } from 'express';

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChatResponse(
  messages: ChatRequestMessage[],
  systemPrompt: string,
  res: Response,
  provider?: string,
  model?: string,
): Promise<void> {
  // SSE ヘッダーの送信
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeSSE = (payload: object): boolean => {
    if (res.writableEnded) return false;
    return res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // デフォルトプロバイダーの判定
  const activeProvider = provider || process.env['AI_PROVIDER'] || 'anthropic';

  try {
    if (activeProvider === 'anthropic') {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      const client = new Anthropic({ apiKey });
      const activeModel = model || process.env['ANTHROPIC_MODEL'] || 'claude-3-5-sonnet-20241022';

      const stream = client.messages.stream({
        model: activeModel,
        max_tokens: 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      stream.on('text', (textDelta) => {
        writeSSE({ type: 'delta', text: textDelta });
      });

      await stream.finalMessage();
      writeSSE({ type: 'done' });

    } else if (activeProvider === 'openai') {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }
      const client = new OpenAI({
        apiKey,
        baseURL: process.env['OPENAI_BASE_URL'] || undefined,
      });
      const activeModel = model || process.env['OPENAI_MODEL'] || 'gpt-4o';

      const stream = await client.chat.completions.create({
        model: activeModel,
        messages: [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          writeSSE({ type: 'delta', text: delta });
        }
      }
      writeSSE({ type: 'done' });

    } else if (activeProvider === 'gemini') {
      const apiKey = process.env['GEMINI_API_KEY'];
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const activeModel = model || process.env['GEMINI_MODEL'] || 'gemini-1.5-flash';

      const genModel = genAI.getGenerativeModel({
        model: activeModel,
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
      });

      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const result = await genModel.generateContentStream({
        contents,
      });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          writeSSE({ type: 'delta', text: text });
        }
      }
      writeSSE({ type: 'done' });

    } else {
      throw new Error(`Unsupported AI provider: ${activeProvider}`);
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[ChatService] [${activeProvider}] stream error:`, message);
    writeSSE({ type: 'error', message });
  } finally {
    res.end();
  }
}
