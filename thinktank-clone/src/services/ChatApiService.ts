// SSE ストリーミングチャットのクライアント側制御（仕様書06 §1.1）

import type { ChatMessage } from '../types';

export interface ChatStreamCallbacks {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export async function streamChat(
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, systemPrompt }),
      signal,
    });
    if (!res.ok || !res.body) {
      callbacks.onError(`チャットAPIエラー: ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const ev = JSON.parse(json);
          if (ev.type === 'delta') callbacks.onDelta(ev.text ?? '');
          else if (ev.type === 'done') callbacks.onDone();
          else if (ev.type === 'error') callbacks.onError(ev.message ?? 'unknown error');
        } catch {
          // 不完全なJSONは無視
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    callbacks.onError((e as Error).message);
  }
}
