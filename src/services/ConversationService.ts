import { apiFetch } from './apiClient';
import type { ContextSnapshot } from './contextTypes';
import { canonicalJson, readConversationLog, validateContext, validateTurn, type ConversationContext, type ConversationTurn } from '../../server/services/conversationRecord';
export type { ConversationContext, ConversationTurn } from '../../server/services/conversationRecord';

export function conversationContext(snapshot: ContextSnapshot): ConversationContext {
  const context: ConversationContext = {
    schemaVersion: 1, snapshotId: snapshot.snapshotId, vaultId: snapshot.vaultId, bundleId: snapshot.bundleId,
    capturedAt: snapshot.capturedAt, scope: 'bundle-only', quality: snapshot.quality,
    sources: snapshot.sources.map(s => ({ thinkId: s.thinkId, title: s.title, content: s.content, contentHash: s.contentHash })),
    issues: snapshot.issues.map(i => `${i.message} (${i.thinkId})`),
    manualState: snapshot.manualState ? structuredClone(snapshot.manualState) : null,
  };
  validateContext(context); return context;
}
export function chatOnlyConversationContext(vaultId: string, chatId: string): ConversationContext {
  const context: ConversationContext = {
    schemaVersion: 1, snapshotId: chatId, vaultId, bundleId: chatId, capturedAt: new Date().toISOString(),
    scope: 'chat-only', quality: 'complete', sources: [], issues: [], manualState: null,
  };
  validateContext(context); return context;
}
async function json(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : '通信に失敗しました。');
  }
  return response.json();
}
export class ConversationClient {
  async status(signal?: AbortSignal): Promise<{ enabled: boolean; provider: string; model: string }> {
    const value = await json(await apiFetch('/api/think-support/conversations/status', { signal }));
    if (!value || typeof value !== 'object' || !('enabled' in value) || typeof value.enabled !== 'boolean'
      || !('provider' in value) || typeof value.provider !== 'string' || !('model' in value) || typeof value.model !== 'string') throw new Error('接続状態を確認できません。');
    return { enabled: value.enabled, provider: value.provider, model: value.model };
  }
  async history(bundleId: string | undefined, signal?: AbortSignal, chatId?: string, vaultId?: string): Promise<ConversationTurn[]> {
    const query = vaultId ? `?vaultId=${encodeURIComponent(vaultId)}` : '';
    const path = chatId
      ? bundleId ? `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}/bundles/${encodeURIComponent(bundleId)}`
        : `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}`
      : `/api/think-support/conversations/bundles/${encodeURIComponent(bundleId!)}`;
    const value = await json(await apiFetch(path + query, { signal }));
    const log = readConversationLog(value);
    if (!chatId && log.turns.some(t => t.context.bundleId !== bundleId)) throw new Error('履歴の対象が一致しません。');
    return log.turns;
  }
  async generate(context: ConversationContext, question: string, historyIds: string[], signal: AbortSignal, chatId?: string): Promise<ConversationTurn> {
    const requestId = crypto.randomUUID();
    const value = await json(await apiFetch('/api/think-support/conversations/turns', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, context, question, historyIds, confirmed: true, chatId }) }));
    validateTurn(value);
    if (value.id !== requestId || value.context.bundleId !== context.bundleId || value.context.vaultId !== context.vaultId
      || canonicalJson(value.context) !== canonicalJson(context) || value.question !== question) throw new Error('応答の対象が送信内容と一致しません。');
    return value;
  }
  async save(turn: ConversationTurn, chatId?: string, bundleId?: string): Promise<void> {
    const path = chatId
      ? bundleId ? `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}/bundles/${encodeURIComponent(bundleId)}/turns/${encodeURIComponent(turn.id)}`
        : `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}/turns/${encodeURIComponent(turn.id)}`
      : `/api/think-support/conversations/bundles/${encodeURIComponent(turn.context.bundleId)}/turns/${encodeURIComponent(turn.id)}`;
    await json(await apiFetch(path, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turn),
    }));
  }
}
