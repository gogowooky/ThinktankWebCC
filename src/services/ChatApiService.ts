/** AI-neutral entry point. Previous implementation is retained in .legacy.ts. */
import type { AiModelSelection } from './aiModels';
export type { ChatRequestMessage, ChatStreamCallbacks } from './ChatApiService.legacy';
import type { ChatRequestMessage, ChatStreamCallbacks } from './ChatApiService.legacy';

export async function streamChat(
  _messages: ChatRequestMessage[], _systemPrompt: string,
  callbacks: ChatStreamCallbacks, signal?: AbortSignal,
  _aiModel?: AiModelSelection, _thoughtSupport = false,
): Promise<void> {
  if (!signal?.aborted) callbacks.onError('AI実行は停止中です。過去の会話は閲覧できます。');
}
