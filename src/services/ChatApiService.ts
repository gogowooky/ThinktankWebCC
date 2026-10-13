/** 旧SSE呼び出しが残る場合にも、停止済みAPIへ通信させない。 */
import type { AiModelSelection } from './aiModels';
export type { ChatRequestMessage, ChatStreamCallbacks } from './ChatApiService.types';
import type { ChatRequestMessage, ChatStreamCallbacks } from './ChatApiService.types';

export async function streamChat(
  _messages: ChatRequestMessage[], _systemPrompt: string,
  callbacks: ChatStreamCallbacks, signal?: AbortSignal,
  _aiModel?: AiModelSelection, _thoughtSupport = false,
): Promise<void> {
  if (!signal?.aborted) callbacks.onError('AI実行は停止中です。過去の会話は閲覧できます。');
}
