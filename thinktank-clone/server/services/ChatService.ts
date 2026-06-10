// 複数 AI プロバイダー対応 SSE ストリーミング処理（仕様書06 §1.2）
// SDK依存を避けるため各プロバイダーのREST APIをfetchで直接利用する。

import type { Response } from 'express';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function sseWrite(res: Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function streamChatToResponse(
  res: Response,
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const provider = process.env.AI_PROVIDER ?? 'anthropic';

  try {
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
      await streamAnthropic(res, messages, systemPrompt);
    } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      await streamOpenAI(res, messages, systemPrompt);
    } else if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
      await streamGemini(res, messages, systemPrompt);
    } else {
      await streamMock(res, messages);
    }
    sseWrite(res, { type: 'done' });
  } catch (e) {
    sseWrite(res, { type: 'error', message: (e as Error).message });
  } finally {
    res.end();
  }
}

// ── Anthropic Claude ──
async function streamAnthropic(res: Response, messages: ChatMessage[], systemPrompt: string): Promise<void> {
  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt || undefined,
      messages,
      stream: true,
    }),
  });
  if (!apiRes.ok || !apiRes.body) throw new Error(`Anthropic API: ${apiRes.status} ${await apiRes.text()}`);
  await pipeSse(apiRes.body, (ev) => {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      sseWrite(res, { type: 'delta', text: ev.delta.text });
    }
  });
}

// ── OpenAI ──
async function streamOpenAI(res: Response, messages: ChatMessage[], systemPrompt: string): Promise<void> {
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const apiRes = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages,
      stream: true,
    }),
  });
  if (!apiRes.ok || !apiRes.body) throw new Error(`OpenAI API: ${apiRes.status} ${await apiRes.text()}`);
  await pipeSse(apiRes.body, (ev) => {
    const text = ev.choices?.[0]?.delta?.content;
    if (text) sseWrite(res, { type: 'delta', text });
  });
}

// ── Google Gemini ──
async function streamGemini(res: Response, messages: ChatMessage[], systemPrompt: string): Promise<void> {
  const model = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`;
  const apiRes = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    }),
  });
  if (!apiRes.ok || !apiRes.body) throw new Error(`Gemini API: ${apiRes.status} ${await apiRes.text()}`);
  await pipeSse(apiRes.body, (ev) => {
    const text = ev.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) sseWrite(res, { type: 'delta', text });
  });
}

// ── モック（APIキー未設定時のオフライン動作確認用）──
async function streamMock(res: Response, messages: ChatMessage[]): Promise<void> {
  const last = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
  const text = [
    '（モック応答: AI_PROVIDER と APIキーを server/.env に設定すると実際のAIが応答します）',
    '',
    `受け取ったメッセージ: 「${last.slice(0, 120)}」`,
    `会話履歴: ${messages.length} 件`,
  ].join('\n');
  for (const ch of text) {
    sseWrite(res, { type: 'delta', text: ch });
    await new Promise((r) => setTimeout(r, 4));
  }
}

/** SSEレスポンスボディを行単位でパースしてイベントごとにコールバックする */
async function pipeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (ev: any) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') continue;
      try {
        onEvent(JSON.parse(json));
      } catch {
        // 不完全なJSONは無視
      }
    }
  }
}
