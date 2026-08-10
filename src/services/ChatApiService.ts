/**
 * ChatApiService.ts
 * Phase 14: サーバーの /api/chat/messages (SSE) を呼び出すクライアントヘルパー。
 */

import { apiFetch } from './apiClient';
import type { AiModelSelection } from './aiModels';

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatStreamCallbacks {
  onDelta: (text: string) => void;
  onDone:  (metadata?: { createdFileId?: string; category?: string }) => void;
  onError: (message: string) => void;
}

const CHAT_API_PATH = '/api/chat/messages';

export async function streamChat(
  messages: ChatRequestMessage[],
  systemPrompt: string,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
  /** 省略時はサーバー側のデフォルト（環境変数）で動作する */
  aiModel?: AiModelSelection,
): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch(CHAT_API_PATH, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        messages,
        systemPrompt,
        ...(aiModel ? { provider: aiModel.provider, model: aiModel.model } : {}),
      }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    callbacks.onError((err as Error).message ?? 'Network error');
    return;
  }

  if (!res.ok) {
    callbacks.onError(`HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) { callbacks.onError('No response body'); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as
            | { type: 'delta'; text: string }
            | { type: 'done'; createdFileId?: string; category?: string }
            | { type: 'error'; message: string };

          if (event.type === 'delta')  callbacks.onDelta(event.text);
          else if (event.type === 'done')  callbacks.onDone(event.createdFileId ? { createdFileId: event.createdFileId, category: event.category } : undefined);
          else if (event.type === 'error') callbacks.onError(event.message);
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError((err as Error).message ?? 'Stream read error');
    }
  } finally {
    reader.releaseLock();
  }
}
