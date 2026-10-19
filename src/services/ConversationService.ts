import { apiFetch, readApiJson } from './apiClient';
import type { TTVault } from '../models/TTVault';
import { TTModels } from '../models/TTModels';
import { StorageManager } from './storage/StorageManager';
import { usesLocalRelay } from './runtimeMode';
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
} from '../../shared/contracts/conversationRecord';
import { THINK_FIELDS, type ThinkField } from '../../shared/contracts/thinkSupportRecord';
import { DomainProfileManager } from '../platform/DomainProfileManager';
import { FirestoreRelayClient } from '../platform/web/FirestoreRelayClient';
import { extractOperationsState, addPromotionCandidate } from '../../shared/operations';
import type { ValidatedPromotionCandidate } from '../../shared/responseValidator';
import { invokeIpc } from '../utils/ipcError';

export type { ConversationContext, ConversationTurn } from '../../shared/contracts/conversationRecord';

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

    if (!usesLocalRelay()) {
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
    _isCurrent?: () => boolean,
  ): Promise<ConversationTurn[]> {
    const targetId = chatId || bundleId;
    if (!targetId) return [];
    const activeVault = vault ?? TTModels.Instance?.Vault;
    const targetThink = activeVault?.GetThink(targetId);

    try {
      const record = await StorageManager.instance.getRecord(targetId);
      if (record) {
        try {
          const log = readConversationLog(record.meta.metadata?.thinkConversations);
          if (log.turns.length > 0) return log.turns;
        } catch {
          // 旧版の本文トランスクリプトへフォールバックする。
        }
        if (chatId && vaultId && record.body.trim()) {
          return legacyConversationTurns(
            record.body,
            vaultId,
            chatId,
            record.meta.updatedAt || new Date().toISOString(),
          );
        }
        return [];
      }
    } catch (error) {
      if (!targetThink) throw error;
      // 既にメモリへ読み込み済みなら一時的な接続断でも表示だけは継続する。
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

      const electronAi = typeof window !== 'undefined' ? window.electronAPI?.ai : undefined;
      if (electronAi?.conversation) {
        aiRes = await invokeIpc(() => electronAi.conversation(payload));
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

    if (!usesLocalRelay()) {
      throw new Error('AIに接続できません。PC版を使うか、中継役PCとの接続を設定してください。');
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
    const targetId = chatId || bundleId || turn.context.bundleId;
    const activeVault = TTModels.Instance?.Vault;
    const think = activeVault?.GetThink(targetId);
    const record = await StorageManager.instance.getRecord(targetId);
    if (!record) throw new Error('保存対象のレコードが見つかりません。');

    let currentTurns: ConversationTurn[];
    try {
      currentTurns = readConversationLog(record.meta.metadata?.thinkConversations).turns;
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
    const opsRecord =
      targetOpsId === targetId
        ? record
        : await StorageManager.instance.getRecord(targetOpsId);
    let operations: ReturnType<typeof extractOperationsState> | undefined;
    if (opsRecord && extractedCandidates.length > 0) {
      let opsState = extractOperationsState(
        opsRecord.meta.metadata,
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
      operations = opsState;
      if (targetOpsId !== targetId) {
        const savedOpsMeta = await StorageManager.instance.updateMetadata(
          targetOpsId,
          { operations: opsState },
          opsRecord.meta.updatedAt || undefined,
        );
        const opsThink = activeVault?.GetThink(targetOpsId);
        if (opsThink) {
          opsThink.Metadata = savedOpsMeta.metadata ?? {};
          opsThink.UpdatedAt = savedOpsMeta.updatedAt;
          opsThink.markMetadataSaved();
        }
      }
    }

    const nextMetadata: Record<string, unknown> = {
      ...(record.meta.metadata ?? {}),
      thinkConversations: nextLog,
      ...(targetOpsId === targetId && operations ? { operations } : {}),
    };
    let savedMeta;
    let savedFullContent = record.body
      ? `${record.meta.title}\n${record.body}`
      : record.meta.title;
    if (chatId && record.meta.category === 'chat') {
      const mergedBody = mergeConversationTranscript(record.body, nextTurns);
      savedFullContent = mergedBody ? `${record.meta.title}\n${mergedBody}` : record.meta.title;
      savedMeta = await StorageManager.instance.save({
        thinkid: targetId,
        category: record.meta.category,
        fullContent: savedFullContent,
        keywords: record.meta.keywords,
        relatedIds: record.meta.relatedIds,
        metadata: nextMetadata,
        baseUpdatedAt: record.meta.updatedAt || undefined,
      });
    } else {
      savedMeta = await StorageManager.instance.updateMetadata(
        targetId,
        {
          thinkConversations: nextLog,
          ...(targetOpsId === targetId && operations ? { operations } : {}),
        },
        record.meta.updatedAt || undefined,
      );
    }

    if (think) {
      think.Metadata = savedMeta.metadata ?? nextMetadata;
      if (chatId && record.meta.category === 'chat') think.setContentSilent(savedFullContent);
      think.UpdatedAt = savedMeta.updatedAt;
      think.markSaved();
      think.markMetadataSaved();
      activeVault?.NotifyUpdated(false);
    }
    turnPromotionCandidatesMap.delete(turn.id);
    return;
  }
}
