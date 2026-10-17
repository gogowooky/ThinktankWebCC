import { apiFetch, readApiJson } from './apiClient';
import type { TTVault } from '../models/TTVault';
import { TTModels } from '../models/TTModels';
import { StorageManager } from './storage/StorageManager';
import type { AiModelSelection } from './aiModels';
import type { ContextSnapshot } from './contextTypes';
import {
  canonicalJson,
  readConversationLog,
  validateContext,
  validateTurn,
  mergeConversationTranscript,
  legacyConversationTurns,
  type ConversationContext,
  type ConversationTurn,
  type Citation,
  type Proposal,
} from '../../server/contracts/conversationRecord';
import { THINK_FIELDS, type ThinkField } from '../../server/contracts/thinkSupportRecord';
import { DomainProfileManager } from '../platform/DomainProfileManager';
import { FirestoreRelayClient } from '../platform/web/FirestoreRelayClient';
import { extractOperationsState, addPromotionCandidate } from '../../shared/operations';
import type { ValidatedPromotionCandidate } from '../../shared/responseValidator';

export type { ConversationContext, ConversationTurn } from '../../server/contracts/conversationRecord';

function isWebCloudMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (StorageManager.instance?.webProvider === 'drive') return true;
  const host = window.location?.hostname || '';
  return host.endsWith('.web.app') || host.endsWith('.firebaseapp.com');
}

/** Turn ID ごとに AI が抽出した昇格候補（PromotionCandidates）を保持するインメモリマップ */
const turnPromotionCandidatesMap = new Map<string, ValidatedPromotionCandidate[]>();

export function getTurnPromotionCandidates(turnId: string): ValidatedPromotionCandidate[] {
  return turnPromotionCandidatesMap.get(turnId) ?? [];
}

export function conversationContext(snapshot: ContextSnapshot): ConversationContext {
  const context: ConversationContext = {
    schemaVersion: 1,
    snapshotId: snapshot.snapshotId,
    vaultId: snapshot.vaultId,
    bundleId: snapshot.bundleId,
    capturedAt: snapshot.capturedAt,
    scope: 'bundle-only',
    quality: snapshot.quality,
    sources: snapshot.sources.map((s) => ({
      thinkId: s.thinkId,
      title: s.title,
      content: s.content,
      contentHash: s.contentHash,
      contentType: s.contentType,
    })),
    issues: snapshot.issues.map((i) => `${i.message} (${i.thinkId})`),
    manualState: snapshot.manualState ? structuredClone(snapshot.manualState) : null,
    ...(snapshot.subtasks ? { subtasks: structuredClone(snapshot.subtasks) } : {}),
    ...(snapshot.bundleProgress ? { bundleProgress: structuredClone(snapshot.bundleProgress) } : {}),
  };
  validateContext(context);
  return context;
}

export function chatOnlyConversationContext(vaultId: string, chatId: string): ConversationContext {
  const context: ConversationContext = {
    schemaVersion: 1,
    snapshotId: chatId,
    vaultId,
    bundleId: chatId,
    capturedAt: new Date().toISOString(),
    scope: 'chat-only',
    quality: 'complete',
    sources: [],
    issues: [],
    manualState: null,
  };
  validateContext(context);
  return context;
}

export class ConversationClient {
  async status(signal?: AbortSignal): Promise<{ enabled: boolean; provider: string; model: string }> {
    if (typeof window !== 'undefined' && window.electronAPI?.ai?.getStatus) {
      const st = await window.electronAPI.ai.getStatus();
      const cli = st.preferredCli || 'claude';
      return {
        enabled: true,
        provider: `local-cli:${cli}`,
        model: st.preferredModel || `${cli}-default`,
      };
    }

    if (FirestoreRelayClient.isConfigured()) {
      return {
        enabled: true,
        provider: 'firebase-e2ee-relay',
        model: 'local-cli-via-relay',
      };
    }

    if (isWebCloudMode()) {
      return {
        enabled: false,
        provider: 'firebase-e2ee-relay',
        model: 'unconfigured',
      };
    }

    const value = await readApiJson(
      await apiFetch('/api/think-support/conversations/status', { signal }),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      !('enabled' in value) ||
      typeof value.enabled !== 'boolean' ||
      !('provider' in value) ||
      typeof value.provider !== 'string' ||
      !('model' in value) ||
      typeof value.model !== 'string'
    ) {
      throw new Error('接続状態を確認できません。');
    }
    return { enabled: value.enabled, provider: value.provider, model: value.model };
  }

  async history(
    bundleId: string | undefined,
    signal?: AbortSignal,
    chatId?: string,
    vaultId?: string,
    vault?: TTVault,
    isCurrent?: () => boolean,
  ): Promise<ConversationTurn[]> {
    if (typeof window !== 'undefined' && window.electronAPI?.storage?.getRecord) {
      const targetId = chatId || bundleId;
      if (!targetId) return [];
      const rec = await window.electronAPI.storage.getRecord(targetId);
      if (!rec) return [];
      const rawLog = rec.meta.metadata?.thinkConversations;
      try {
        const log = readConversationLog(rawLog);
        if (log.turns.length > 0) {
          return log.turns;
        }
      } catch {
        // Fallback to legacy text turns
      }
      if (chatId && vaultId && rec.body) {
        return legacyConversationTurns(rec.body, vaultId, chatId, rec.meta.updatedAt || new Date().toISOString());
      }
      return [];
    }

    if (isWebCloudMode()) {
      const targetId = chatId || bundleId;
      if (!targetId) return [];
      const activeVault = vault ?? TTModels.Instance?.Vault;
      const targetThink = activeVault?.GetThink(targetId);

      if (FirestoreRelayClient.isConfigured() && (!targetThink || targetThink.IsMetaOnly)) {
        try {
          const relayRes = await FirestoreRelayClient.request<
            { thinkid: string; includeSupport?: boolean },
            {
              thinkid: string;
              meta?: { metadata?: Record<string, unknown>; updatedAt?: string };
              body?: string;
              support?: Record<string, unknown>;
            } | null
          >('getBody', { thinkid: targetId, includeSupport: true });
          if (relayRes.ok && relayRes.result) {
            const rawSupport =
              relayRes.result.support?.thinkConversations ??
              relayRes.result.meta?.metadata?.thinkConversations;
            if (rawSupport) {
              try {
                const log = readConversationLog(rawSupport);
                if (log.turns.length > 0) return log.turns;
              } catch {
                // ignore
              }
            }
            if (chatId && vaultId && relayRes.result.body) {
              return legacyConversationTurns(
                relayRes.result.body,
                vaultId,
                chatId,
                relayRes.result.meta?.updatedAt || new Date().toISOString(),
              );
            }
          }
        } catch {
          // Relay オフライン時はローカルモデルの値をそのまま使用
        }
      }

      if (!targetThink) return [];
      const rawLog = targetThink.Metadata?.thinkConversations;
      try {
        const log = readConversationLog(rawLog);
        if (log.turns.length > 0) {
          return log.turns;
        }
      } catch {
        // Fallback to legacy text turns
      }
      if (chatId && vaultId && targetThink.Content) {
        const nl = targetThink.Content.indexOf('\n');
        const body = nl >= 0 ? targetThink.Content.slice(nl + 1) : '';
        if (body.trim()) {
          return legacyConversationTurns(
            body,
            vaultId,
            chatId,
            targetThink.UpdatedAt || new Date().toISOString(),
          );
        }
      }
      return [];
    }

    const chat = chatId ? vault?.GetThink(chatId) : undefined;
    const before =
      chat && !chat.IsDirty && !chat.IsMetadataDirty
        ? {
            content: chat.Content,
            metadata: JSON.stringify(chat.Metadata),
            version: chat.UpdatedAt,
          }
        : undefined;
    const query = vaultId ? `?vaultId=${encodeURIComponent(vaultId)}` : '';
    const path = chatId
      ? bundleId
        ? `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}/bundles/${encodeURIComponent(bundleId)}`
        : `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}`
      : `/api/think-support/conversations/bundles/${encodeURIComponent(bundleId!)}`;
    const value = await readApiJson(await apiFetch(path + query, { signal }));
    const log = readConversationLog(value);
    if (!chatId && log.turns.some((t) => t.context.bundleId !== bundleId)) {
      throw new Error('履歴の対象が一致しません。');
    }
    // Only a complete saved record can advance the local save baseline. Never overwrite editor changes.
    const saved =
      value && typeof value === 'object' && 'savedChat' in value ? value.savedChat : undefined;
    if (
      (!isCurrent || isCurrent()) &&
      chat &&
      before &&
      vault?.GetThink(chatId!) === chat &&
      !signal?.aborted &&
      !chat.IsDirty &&
      !chat.IsMetadataDirty &&
      chat.Content === before.content &&
      JSON.stringify(chat.Metadata) === before.metadata &&
      chat.UpdatedAt === before.version &&
      saved &&
      typeof saved === 'object' &&
      'id' in saved &&
      saved.id === chatId &&
      'title' in saved &&
      typeof saved.title === 'string' &&
      'content' in saved &&
      typeof saved.content === 'string' &&
      'metadata' in saved &&
      saved.metadata &&
      typeof saved.metadata === 'object' &&
      !Array.isArray(saved.metadata) &&
      'keywords' in saved &&
      typeof saved.keywords === 'string' &&
      'relatedIds' in saved &&
      typeof saved.relatedIds === 'string' &&
      'updatedAt' in saved &&
      typeof saved.updatedAt === 'string' &&
      Number.isFinite(Date.parse(saved.updatedAt)) &&
      (!before.version || Date.parse(saved.updatedAt) >= Date.parse(before.version))
    ) {
      const changed =
        chat.Content !== `${saved.title}\n${saved.content}` ||
        JSON.stringify(chat.Metadata) !== JSON.stringify(saved.metadata) ||
        chat.UpdatedAt !== saved.updatedAt ||
        chat.IsMetaOnly ||
        chat.Keywords !== saved.keywords ||
        chat.RelatedIDs !== saved.relatedIds;
      chat.setContentSilent(`${saved.title}\n${saved.content}`);
      chat.Metadata = structuredClone(saved.metadata) as Record<string, unknown>;
      chat.Keywords = saved.keywords;
      chat.RelatedIDs = saved.relatedIds;
      chat.UpdatedAt = saved.updatedAt;
      chat.IsMetaOnly = false;
      chat.markSaved();
      chat.markMetadataSaved();
      if (changed) vault.NotifyUpdated(false);
    }
    return log.turns;
  }

  /** model を渡すとそのモデルと会話する（省略時はサーバーまたはローカルCLI既定）。 */
  async generate(
    context: ConversationContext,
    question: string,
    historyIds: string[],
    signal: AbortSignal,
    chatId?: string,
    model?: AiModelSelection,
  ): Promise<ConversationTurn> {
    const requestId = crypto.randomUUID();

    if (
      (typeof window !== 'undefined' && window.electronAPI?.ai?.conversation) ||
      FirestoreRelayClient.isConfigured()
    ) {
      const profile = DomainProfileManager.activeProfile;
      const relatedDocuments = context.sources.map((s) => ({
        thinkid: s.thinkId,
        title: s.title,
        category: s.contentType,
        excerpt: s.content.slice(0, 2000),
      }));

      let cliName: 'claude' | 'codex' | 'gemini' | undefined;
      if (model?.provider) {
        const pLower = model.provider.toLowerCase();
        if (pLower.includes('claude') || pLower.includes('anthropic')) cliName = 'claude';
        else if (pLower.includes('openai') || pLower.includes('codex') || pLower.includes('gpt')) cliName = 'codex';
        else if (pLower.includes('gemini') || pLower.includes('google')) cliName = 'gemini';
      }

      const payload = {
        cliName,
        model: model?.model,
        profileId: profile.id,
        panelRole: context.scope === 'chat-only' ? ('Thinktank' as const) : ('Discuss' as const),
        bundleId: context.bundleId,
        bundleTitle: context.sources[0]?.title || context.bundleId,
        bundleSummary: context.manualState?.values.goal || '',
        currentPhase: context.manualState?.values.stage || '',
        nextAction: context.manualState?.values.nextAction || '',
        relatedDocuments,
        userMessage: question,
      };

      let aiRes: {
        reply: string;
        insufficientEvidence?: boolean;
        citations?: Array<{ sourceThinkid: string; snippet?: string }>;
        proposals?: Array<{ field: string; proposedValue: string; reason: string }>;
        promotionCandidates?: ValidatedPromotionCandidate[];
        executedCli?: string;
      };

      if (typeof window !== 'undefined' && window.electronAPI?.ai?.conversation) {
        aiRes = await window.electronAPI.ai.conversation(payload);
      } else {
        const relayRes = await FirestoreRelayClient.request<typeof payload, typeof aiRes>(
          'ai.conversation',
          payload,
        );
        if (!relayRes.ok || !relayRes.result) {
          throw new Error(relayRes.error || 'Firebase E2EE 中継でのAI応答取得に失敗しました。');
        }
        aiRes = relayRes.result;
      }

      if (aiRes.promotionCandidates && aiRes.promotionCandidates.length > 0) {
        turnPromotionCandidatesMap.set(requestId, aiRes.promotionCandidates);
      }

      // ConversationRecord 契約に沿った Citation / Proposal の正規化
      const citations: Citation[] = [];
      for (const c of aiRes.citations || []) {
        const src = context.sources.find((s) => s.thinkId === c.sourceThinkid);
        if (!src || !c.snippet) continue;
        const start = src.content.indexOf(c.snippet);
        if (start >= 0) {
          citations.push({
            thinkId: src.thinkId,
            quote: c.snippet,
            contentHash: src.contentHash,
            start,
            end: start + c.snippet.length,
          });
        }
      }

      const proposals: Proposal[] = [];
      const seenFields = new Set<string>();
      for (const p of aiRes.proposals || []) {
        const mappedField: ThinkField = THINK_FIELDS.includes(p.field as ThinkField)
          ? (p.field as ThinkField)
          : p.field === 'summary'
            ? 'goal'
            : p.field === 'currentPhase'
              ? 'stage'
              : 'nextAction';
        if (seenFields.has(mappedField) || !p.proposedValue.trim()) continue;
        seenFields.add(mappedField);
        proposals.push({
          field: mappedField,
          before: context.manualState?.values[mappedField] ?? '',
          after: p.proposedValue.trim(),
          reason: p.reason.trim() || 'AI CLI からの提案',
        });
      }

      const turn: ConversationTurn = {
        schemaVersion: 1,
        id: requestId,
        createdAt: new Date().toISOString(),
        question,
        context,
        answer: {
          reply: aiRes.reply || '（応答なし）',
          insufficientEvidence: Boolean(aiRes.insufficientEvidence),
          citations,
          proposals,
        },
        provider: `local-cli:${aiRes.executedCli || 'claude'}`,
        model: model?.model || `${aiRes.executedCli || 'claude'}-isolated`,
      };
      validateTurn(turn);
      return turn;
    }

    const value = await readApiJson(
      await apiFetch('/api/think-support/conversations/turns', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          context,
          question,
          historyIds,
          confirmed: true,
          chatId,
          ...(model ? { provider: model.provider, model: model.model } : {}),
        }),
      }),
    );
    validateTurn(value);
    if (
      value.id !== requestId ||
      value.context.bundleId !== context.bundleId ||
      value.context.vaultId !== context.vaultId ||
      canonicalJson(value.context) !== canonicalJson(context) ||
      value.question !== question
    ) {
      throw new Error('応答の対象が送信内容と一致しません。');
    }
    return value;
  }

  async save(turn: ConversationTurn, chatId?: string, bundleId?: string): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      window.electronAPI?.storage?.getRecord &&
      window.electronAPI?.storage?.saveSupport
    ) {
      const targetId = chatId || bundleId || turn.context.bundleId;
      const rec = await window.electronAPI.storage.getRecord(targetId);
      if (!rec) throw new Error('保存対象のレコードが見つかりません。');

      let currentTurns: ConversationTurn[] = [];
      try {
        currentTurns = readConversationLog(rec.meta.metadata?.thinkConversations).turns;
      } catch {
        currentTurns = [];
      }
      const nextTurns = currentTurns.some((t) => t.id === turn.id)
        ? currentTurns
        : [...currentTurns, turn];
      const nextLog = { schemaVersion: 1 as const, turns: nextTurns };

      // 昇格候補があれば Bundle（または対象レコード）の operations にも追加
      const extractedCandidates = turnPromotionCandidatesMap.get(turn.id) ?? [];
      const targetOpsId = bundleId || turn.context.bundleId || targetId;
      const opsRec =
        targetOpsId === targetId
          ? rec
          : await window.electronAPI.storage.getRecord(targetOpsId);

      if (opsRec && extractedCandidates.length > 0) {
        let opsState = extractOperationsState(
          opsRec.meta.metadata,
          DomainProfileManager.activeProfile,
        );
        for (const cand of extractedCandidates) {
          opsState = addPromotionCandidate(
            opsState,
            {
              bundleId: targetOpsId,
              sourceChatThinkid: chatId,
              sourceMessageId: turn.id,
              type: cand.type,
              title: cand.title,
              summary: cand.summary,
              rationale: cand.rationale,
              impactScope: cand.impactScope,
              proposedOwner: cand.proposedOwner,
              dueDate: cand.dueDate,
              citations: cand.citations,
              createdBy: 'ai',
            },
            'ai',
          );
        }
        await window.electronAPI.storage.saveSupport(targetOpsId, {
          operations: opsState,
        });
      }

      await window.electronAPI.storage.saveSupport(targetId, {
        thinkConversations: nextLog,
      });

      // Chat レコードの場合は本文のトランスクリプトも更新する
      if (chatId && rec.meta.category === 'chat') {
        const mergedBody = mergeConversationTranscript(rec.body, nextTurns);
        const fullContent = mergedBody ? `${rec.meta.title}\n${mergedBody}` : rec.meta.title;
        await window.electronAPI.storage.save({
          thinkid: chatId,
          category: rec.meta.category,
          fullContent,
          keywords: rec.meta.keywords,
          relatedIds: rec.meta.relatedIds,
        });
      }
      return;
    }

    if (isWebCloudMode()) {
      const targetId = chatId || bundleId || turn.context.bundleId;
      const activeVault = TTModels.Instance?.Vault;
      const think = activeVault?.GetThink(targetId);

      let currentTurns: ConversationTurn[] = [];
      try {
        currentTurns = readConversationLog(think?.Metadata?.thinkConversations).turns;
      } catch {
        currentTurns = [];
      }
      const nextTurns = currentTurns.some((t) => t.id === turn.id)
        ? currentTurns
        : [...currentTurns, turn];
      const nextLog = { schemaVersion: 1 as const, turns: nextTurns };

      // 昇格候補があれば対象 Bundle / Chat の operations にも追加
      const extractedCandidates = turnPromotionCandidatesMap.get(turn.id) ?? [];
      const targetOpsId = bundleId || turn.context.bundleId || targetId;
      const opsThink = activeVault?.GetThink(targetOpsId);
      if (opsThink && extractedCandidates.length > 0) {
        let opsState = extractOperationsState(
          opsThink.Metadata,
          DomainProfileManager.activeProfile,
        );
        for (const cand of extractedCandidates) {
          opsState = addPromotionCandidate(
            opsState,
            {
              bundleId: targetOpsId,
              sourceChatThinkid: chatId,
              sourceMessageId: turn.id,
              type: cand.type,
              title: cand.title,
              summary: cand.summary,
              rationale: cand.rationale,
              impactScope: cand.impactScope,
              proposedOwner: cand.proposedOwner,
              dueDate: cand.dueDate,
              citations: cand.citations,
              createdBy: 'ai',
            },
            'ai',
          );
        }
        opsThink.Metadata = {
          ...(opsThink.Metadata ?? {}),
          operations: opsState,
        };
        if (targetOpsId !== targetId) {
          const savedOpsMeta = await StorageManager.instance.save({
            thinkid: opsThink.ID,
            category: opsThink.ContentType,
            fullContent: opsThink.Content,
            keywords: opsThink.Keywords,
            relatedIds: opsThink.RelatedIDs,
            metadata: opsThink.Metadata,
            baseUpdatedAt: opsThink.UpdatedAt || undefined,
          });
          opsThink.UpdatedAt = savedOpsMeta.updatedAt;
          opsThink.markSaved();
          opsThink.markMetadataSaved();
        }
      }

      if (think) {
        const nextMetadata: Record<string, unknown> = {
          ...(think.Metadata ?? {}),
          thinkConversations: nextLog,
        };
        think.Metadata = nextMetadata;

        let fullContent = think.Content || `# ${think.Name}`;
        if (chatId && think.ContentType === 'chat') {
          const nl = fullContent.indexOf('\n');
          const titleLine =
            nl >= 0 ? fullContent.slice(0, nl).replace(/\r$/, '') : fullContent.replace(/\r$/, '');
          const bodyText = nl >= 0 ? fullContent.slice(nl + 1) : '';
          const mergedBody = mergeConversationTranscript(bodyText, nextTurns);
          fullContent = mergedBody ? `${titleLine}\n${mergedBody}` : titleLine;
          think.setContentSilent(fullContent);
        }

        const savedMeta = await StorageManager.instance.save({
          thinkid: think.ID,
          category: think.ContentType,
          fullContent,
          keywords: think.Keywords,
          relatedIds: think.RelatedIDs,
          metadata: nextMetadata,
          baseUpdatedAt: think.UpdatedAt || undefined,
        });
        think.UpdatedAt = savedMeta.updatedAt;
        think.markSaved();
        think.markMetadataSaved();
        activeVault?.NotifyUpdated(false);
      }
      return;
    }

    const path = chatId
      ? bundleId
        ? `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}/bundles/${encodeURIComponent(bundleId)}/turns/${encodeURIComponent(turn.id)}`
        : `/api/think-support/conversations/chats/${encodeURIComponent(chatId)}/turns/${encodeURIComponent(turn.id)}`
      : `/api/think-support/conversations/bundles/${encodeURIComponent(turn.context.bundleId)}/turns/${encodeURIComponent(turn.id)}`;
    await readApiJson(
      await apiFetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(turn),
      }),
    );
  }
}
