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
  async history(bundleId: string, signal?: AbortSignal): Promise<ConversationTurn[]> {
    const value = await json(await apiFetch(`/api/think-support/conversations/bundles/${encodeURIComponent(bundleId)}`, { signal }));
    const log = readConversationLog(value);
    if (log.turns.some(t => t.context.bundleId !== bundleId)) throw new Error('履歴の対象が一致しません。');
    return log.turns;
  }
  async generate(context: ConversationContext, question: string, historyIds: string[], signal: AbortSignal): Promise<ConversationTurn> {
    const requestId = crypto.randomUUID();
    const value = await json(await apiFetch('/api/think-support/conversations/turns', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, context, question, historyIds, confirmed: true }) }));
    validateTurn(value);
    if (value.id !== requestId || value.context.bundleId !== context.bundleId || value.context.vaultId !== context.vaultId
      || canonicalJson(value.context) !== canonicalJson(context) || value.question !== question) throw new Error('応答の対象が送信内容と一致しません。');
    return value;
  }
  async save(turn: ConversationTurn): Promise<void> {
    await json(await apiFetch(`/api/think-support/conversations/bundles/${encodeURIComponent(turn.context.bundleId)}/turns/${encodeURIComponent(turn.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turn),
    }));
  }
}
