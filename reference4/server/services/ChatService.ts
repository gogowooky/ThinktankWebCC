/**
 * ChatService.ts
 * Anthropic Claude API ラッパー（ストリーミング対応）
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatService {
  private client: Anthropic | null = null;
  private model: string;

  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  }

  initialize(): boolean {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('ANTHROPIC_API_KEY not set, Chat API disabled');
      return false;
    }
    this.client = new Anthropic({ apiKey });
    console.log(`Chat API initialized (model: ${this.model})`);
    return true;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * ストリーミングレスポンスを返す
   */
  async *streamMessage(
    messages: ChatTurn[],
    systemPrompt?: string,
  ): AsyncIterable<{ type: 'delta' | 'done'; text: string }> {
    if (!this.client) throw new Error('Chat API not initialized');

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt || 'You are a helpful assistant.',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    let fullText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        yield { type: 'delta', text: event.delta.text };
      }
    }
    yield { type: 'done', text: fullText };
  }
}

export const chatService = new ChatService();
