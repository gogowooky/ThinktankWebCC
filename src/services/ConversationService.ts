import { apiFetch, readApiJson } from './apiClient';
import type { TTVault } from '../models/TTVault';
import type { AiModelSelection } from './aiModels';
import type { ContextSnapshot } from './contextTypes';
import { canonicalJson, readConversationLog, validateContext, validateTurn, type ConversationContext, type ConversationTurn } from '../../server/contracts/conversationRecord';
export type { ConversationContext, ConversationTurn } from '../../server/contracts/conversationRecord';

export function conversationContext(snapshot: ContextSnapshot): ConversationContext {
  const context: ConversationContext = {
    schemaVersion: 1, snapshotId: snapshot.snapshotId, vaultId: snapshot.vaultId, bundleId: snapshot.bundleId,
    capturedAt: snapshot.capturedAt, scope: 'bundle-only', quality: snapshot.quality,
    sources: snapshot.sources.map(s => ({ thinkId: s.thinkId, title: s.title, content: s.content, contentHash: s.contentHash, contentType: s.contentType })),
    issues: snapshot.issues.map(i => `${i.message} (${i.thinkId})`),
    manualState: snapshot.manualState ? structuredClone(snapshot.manualState) : null,
    ...(snapshot.subtasks ? { subtasks: structuredClone(snapshot.subtasks) } : {}),
    ...(snapshot.bundleProgress ? { bundleProgress: structuredClone(snapshot.bundleProgress) } : {}),
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
export class ConversationClient {
  async status(signal?: AbortSignal): Promise<{ enabled: boolean; provider: string; model: string }> {
    const value = await readApiJson(await apiFetch('/api/think-support/conversations/status', { signal }));
    if (!value || typeof value !== 'object' || !('enabled' in value) || typeof value.enabled !== 'boolean'
      || !('provider' in value) || typeof value.provider !== 'string' || !('model' in value) || typeof value.model !== 'string') throw new Error('接続状態を確認できません。');
    return { enabled: value.enabled, provider: value.provider, model: value.model };
  }
  async history(bundleId: string | undefined, signal?: AbortSignal, chatId?: string, vaultId?: string, vault?: TTVault, isCurrent?: () => boolean): Promise<ConversationTurn[]> {
    const chat = chatId ? vault?.GetThink(chatId) : undefined;
    const before = chat && !chat.IsDirty && !chat.IsMetadataDirty
      ? { content: chat.Content, metadata: JSON.stringify(chat.Metadata), version: chat.UpdatedAt } : undefined;
    const query = vaultId ? `?vaultId=${encodeURIComponent(vaultId)}` : '';
    const path = chatId
      ? bundleId ? `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}/bundles/${encodeURIComponent(bundleId)}`
        : `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}`
      : `/api/think-support/conversations/bundles/${encodeURIComponent(bundleId!)}`;
    const value = await readApiJson(await apiFetch(path + query, { signal }));
    const log = readConversationLog(value);
    if (!chatId && log.turns.some(t => t.context.bundleId !== bundleId)) throw new Error('履歴の対象が一致しません。');
    // Only a complete saved record can advance the local save baseline. Never overwrite editor changes.
    const saved = value && typeof value === 'object' && 'savedChat' in value ? value.savedChat : undefined;
    if ((!isCurrent || isCurrent()) && chat && before && vault?.GetThink(chatId!) === chat && !signal?.aborted
      && !chat.IsDirty && !chat.IsMetadataDirty && chat.Content === before.content
      && JSON.stringify(chat.Metadata) === before.metadata && chat.UpdatedAt === before.version
      && saved && typeof saved === 'object' && 'id' in saved && saved.id === chatId
      && 'title' in saved && typeof saved.title === 'string' && 'content' in saved && typeof saved.content === 'string'
      && 'metadata' in saved && saved.metadata && typeof saved.metadata === 'object' && !Array.isArray(saved.metadata)
      && 'keywords' in saved && typeof saved.keywords === 'string' && 'relatedIds' in saved && typeof saved.relatedIds === 'string'
      && 'updatedAt' in saved && typeof saved.updatedAt === 'string' && Number.isFinite(Date.parse(saved.updatedAt))
      && (!before.version || Date.parse(saved.updatedAt) >= Date.parse(before.version))) {
      const changed = chat.Content !== `${saved.title}\n${saved.content}` || JSON.stringify(chat.Metadata) !== JSON.stringify(saved.metadata)
        || chat.UpdatedAt !== saved.updatedAt || chat.IsMetaOnly || chat.Keywords !== saved.keywords || chat.RelatedIDs !== saved.relatedIds;
      chat.setContentSilent(`${saved.title}\n${saved.content}`);
      chat.Metadata = structuredClone(saved.metadata) as Record<string, unknown>;
      chat.Keywords = saved.keywords; chat.RelatedIDs = saved.relatedIds;
      chat.UpdatedAt = saved.updatedAt; chat.IsMetaOnly = false;
      chat.markSaved(); chat.markMetadataSaved(); if (changed) vault.NotifyUpdated(false);
    }
    return log.turns;
  }
  /** model を渡すとそのモデルと会話する（省略時はサーバー既定）。値は Status AIChat.* から決める */
  async generate(context: ConversationContext, question: string, historyIds: string[], signal: AbortSignal, chatId?: string, model?: AiModelSelection): Promise<ConversationTurn> {
    const requestId = crypto.randomUUID();
    const value = await readApiJson(await apiFetch('/api/think-support/conversations/turns', { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, context, question, historyIds, confirmed: true, chatId,
        ...(model ? { provider: model.provider, model: model.model } : {}) }) }));
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
    await readApiJson(await apiFetch(path, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turn),
    }));
  }
}
