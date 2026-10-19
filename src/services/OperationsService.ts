/**
 * src/services/OperationsService.ts
 * 業務管理構想案（および高齢者思考支援・生活支援）の共通操作サービス。
 * - 独立Chatからの「情報の昇格（Promotion Candidate → Human Review → Promoted Record）」
 * - 既存レコードの版更新（Supersede）と引用元更新時の `needs_revalidation` 自動検知
 * - Program Gate 管理と通過条件ガード
 * - イベント駆動の監査履歴（Domain Event / Compliance Ledger）
 * すべて <thinkid>.support.json の metadata.operations に永続化し、TTVault 上の TTThink.Metadata とも同期する。
 */

import type { TTVault } from '../models/TTVault';
import { StorageManager } from './storage/StorageManager';
import { DomainProfileManager } from '../platform/DomainProfileManager';
import { FirestoreRelayClient } from '../platform/web/FirestoreRelayClient';
import {
  extractOperationsState,
  addPromotionCandidate,
  approvePromotionCandidate,
  rejectPromotionCandidate,
  detectRevalidationNeeded,
  resolveRevalidation,
  updateGateStatus,
  appendDomainEvent,
  type BundleOperationsState,
  type PromotionCandidate,
  type ApprovePromotionParams,
  type ApprovePromotionResult,
  type GateStatus,
} from '../../shared/operations';
import type { ValidatedPromotionCandidate } from '../../shared/responseValidator';
import { invokeIpc } from '../utils/ipcError';

export class OperationsService {
  /**
   * 対象 Bundle（または Chat）の最新 Operations 状態を取得し、
   * 関連メモの UpdatedAt と照合して `needs_revalidation` があれば自動反映する。
   */
  public async getState(vault: TTVault, bundleId: string): Promise<BundleOperationsState> {
    const profile = DomainProfileManager.activeProfile;
    let rawMeta: Record<string, unknown> | undefined = vault.GetThink(bundleId)?.Metadata;

    try {
      const rec = await StorageManager.instance.getRecord(bundleId);
      if (rec?.meta?.metadata) {
        rawMeta = rec.meta.metadata;
      }
    } catch {
      // 一時的な接続断では、表示済みのメモリ状態を読み取り専用で利用する。
    }

    const state = extractOperationsState(rawMeta, profile);

    // 引用元メモの最新バージョン（UpdatedAt）マップを構築して再検証が必要かチェック
    const tokenMap = new Map<string, string>();
    for (const t of vault.GetThinks()) {
      if (t.UpdatedAt) {
        tokenMap.set(t.ID, t.UpdatedAt);
      }
    }
    const reval = detectRevalidationNeeded(state, tokenMap);
    if (reval.affectedRecordIds.length > 0) {
      await this.saveState(vault, bundleId, reval.state);
      return reval.state;
    }

    return state;
  }

  /**
   * Operations 状態を <bundleId>.support.json およびメモリ上の TTThink.Metadata に保存する。
   */
  public async saveState(
    vault: TTVault,
    bundleId: string,
    nextState: BundleOperationsState,
  ): Promise<BundleOperationsState> {
    const think = vault.GetThink(bundleId);
    const record = await StorageManager.instance.getRecord(bundleId);
    if (!record) throw new Error('保存対象のBundleが見つかりません。');
    const savedMeta = await StorageManager.instance.updateMetadata(
      bundleId,
      { operations: nextState },
      record.meta.updatedAt || undefined,
    );
    if (think) {
      think.Metadata = savedMeta.metadata ?? { ...(think.Metadata ?? {}), operations: nextState };
      think.UpdatedAt = savedMeta.updatedAt;
      think.markMetadataSaved();
      vault.NotifyUpdated(false);
    }

    return nextState;
  }

  /**
   * AI または人間が抽出した昇格候補（PromotionCandidate）を追加する。
   */
  public async addCandidate(
    vault: TTVault,
    bundleId: string,
    input: Omit<PromotionCandidate, 'id' | 'createdAt' | 'status'>,
    actor = 'human',
  ): Promise<BundleOperationsState> {
    const state = await this.getState(vault, bundleId);
    const next = addPromotionCandidate(state, input, actor);
    return this.saveState(vault, bundleId, next);
  }

  /**
   * AI 応答から得られた複数の昇格候補を一括登録する。
   */
  public async addCandidatesFromAi(
    vault: TTVault,
    bundleId: string,
    candidates: readonly ValidatedPromotionCandidate[],
    sourceChatThinkid?: string,
    sourceMessageId?: string,
  ): Promise<BundleOperationsState> {
    let state = await this.getState(vault, bundleId);
    if (candidates.length === 0) return state;

    for (const c of candidates) {
      const citationsWithToken = c.citations.map((cit) => ({
        ...cit,
        sourceVersionToken:
          cit.sourceVersionToken || vault.GetThink(cit.sourceThinkid)?.UpdatedAt || undefined,
      }));
      state = addPromotionCandidate(
        state,
        {
          bundleId,
          sourceChatThinkid,
          sourceMessageId,
          type: c.type,
          title: c.title,
          summary: c.summary,
          rationale: c.rationale,
          impactScope: c.impactScope,
          proposedOwner: c.proposedOwner,
          dueDate: c.dueDate,
          citations: citationsWithToken,
          createdBy: 'ai',
        },
        'ai',
      );
    }
    return this.saveState(vault, bundleId, state);
  }

  /**
   * 昇格候補を人間がレビューして承認（PromotedRecord 化）する。
   */
  public async approveCandidate(
    vault: TTVault,
    bundleId: string,
    params: ApprovePromotionParams,
  ): Promise<ApprovePromotionResult> {
    const state = await this.getState(vault, bundleId);
    const result = approvePromotionCandidate(state, params);
    if (!result.ok) {
      return result;
    }
    await this.saveState(vault, bundleId, result.state);
    return result;
  }

  /**
   * 昇格候補を却下する。
   */
  public async rejectCandidate(
    vault: TTVault,
    bundleId: string,
    candidateId: string,
    actor: string,
    reason = '',
  ): Promise<BundleOperationsState> {
    const state = await this.getState(vault, bundleId);
    const next = rejectPromotionCandidate(state, candidateId, actor, reason);
    return this.saveState(vault, bundleId, next);
  }

  /**
   * 引用元更新により `needs_revalidation` になったレコードを再確認済みに戻す。
   */
  public async confirmRevalidation(
    vault: TTVault,
    bundleId: string,
    recordId: string,
    reviewer: string,
  ): Promise<BundleOperationsState> {
    const state = await this.getState(vault, bundleId);
    const tokenMap = new Map<string, string>();
    for (const t of vault.GetThinks()) {
      if (t.UpdatedAt) tokenMap.set(t.ID, t.UpdatedAt);
    }
    const next = resolveRevalidation(state, recordId, reviewer, tokenMap);
    return this.saveState(vault, bundleId, next);
  }

  /**
   * Program Gate の状態を更新する。
   */
  public async updateGate(
    vault: TTVault,
    bundleId: string,
    params: {
      gateId: string;
      status: GateStatus;
      reviewer: string;
      notes?: string;
      blockers?: string[];
      linkedRecordIds?: string[];
    },
  ): Promise<{ ok: boolean; error?: string; state: BundleOperationsState }> {
    const state = await this.getState(vault, bundleId);
    const res = updateGateStatus(state, { ...params, bundleId });
    if (!res.ok) return res;
    await this.saveState(vault, bundleId, res.state);
    return res;
  }

  /**
   * 専門 Agent（Orchestrator）の検証実行結果を監査台帳と昇格候補に記録する。
   */
  public async runSpecialistAgentReview(
    vault: TTVault,
    bundleId: string,
    agentId: string,
    instruction: string,
  ): Promise<{
    reply: string;
    addedCandidatesCount: number;
    executedCli: string;
    state: BundleOperationsState;
  }> {
    const profile = DomainProfileManager.activeProfile;
    const agent = profile.agents.find((a) => a.id === agentId);
    const bundleThink = vault.GetThink(bundleId);
    const state = await this.getState(vault, bundleId);

    const relatedDocuments = vault
      .GetThinks()
      .filter(
        (t) =>
          t.ID === bundleId ||
          t.RelatedIDs.includes(bundleId) ||
          (bundleThink?.RelatedIDs ?? '').includes(t.ID),
      )
      .slice(0, 12)
      .map((t) => ({
        thinkid: t.ID,
        title: t.Name,
        category: t.ContentType,
        updatedAt: t.UpdatedAt,
        excerpt: t.Content.slice(0, 1500),
      }));

    const userMessage =
      instruction.trim() ||
      `${agent?.name || agentId} として、このテーマの資料・到達状態・リスク・根拠の過不足を点検し、上位共有すべき候補を抽出してください。`;

    let reply = '';
    let executedCli = 'local-cli';
    let promotionCandidates: ValidatedPromotionCandidate[] = [];

    const electronAi = typeof window !== 'undefined' ? window.electronAPI?.ai : undefined;
    if (electronAi?.agent) {
      const aiRes = await invokeIpc(() => electronAi.agent({
        profileId: profile.id,
        panelRole: 'Seeds',
        agentId,
        bundleId,
        bundleTitle: bundleThink?.Name || bundleId,
        promotedRecords: state.promotedRecords,
        gates: state.gates,
        relatedDocuments,
        userMessage,
      }));
      reply = aiRes.reply;
      executedCli = aiRes.executedCli;
      promotionCandidates = aiRes.promotionCandidates || [];
    } else if (FirestoreRelayClient.isConfigured()) {
      const relayRes = await FirestoreRelayClient.request<
        Record<string, unknown>,
        {
          reply: string;
          executedCli: string;
          promotionCandidates?: ValidatedPromotionCandidate[];
        }
      >('ai.agent', {
        profileId: profile.id,
        panelRole: 'Seeds',
        agentId,
        bundleId,
        bundleTitle: bundleThink?.Name || bundleId,
        promotedRecords: state.promotedRecords,
        gates: state.gates,
        relatedDocuments,
        userMessage,
      });
      if (relayRes.ok && relayRes.result) {
        reply = relayRes.result.reply;
        executedCli = `relay:${relayRes.result.executedCli || 'local-cli'}`;
        promotionCandidates = relayRes.result.promotionCandidates || [];
      } else {
        throw new Error(relayRes.error || 'Firebase E2EE 中継での専門AI実行に失敗しました。');
      }
    } else {
      reply = `【${agent?.name || agentId}】「${bundleThink?.Name || bundleId}」の関連資料 (${relatedDocuments.length}件) と Gate 状態を点検しました。`;
      promotionCandidates = [
        {
          type: 'evidence',
          title: `${agent?.name || agentId} による点検記録`,
          summary: userMessage,
          rationale: agent?.description,
          impactScope: bundleThink?.Name || bundleId,
          citations: relatedDocuments[0]
            ? [{ sourceThinkid: relatedDocuments[0].thinkid, sourceTitle: relatedDocuments[0].title }]
            : [],
        },
      ];
    }

    let nextState = await this.addCandidatesFromAi(
      vault,
      bundleId,
      promotionCandidates,
      undefined,
      `agent_${agentId}_${Date.now()}`,
    );

    nextState = appendDomainEvent(nextState, {
      idempotencyKey: `agent_run_${agentId}_${Date.now()}`,
      eventType: 'AgentVerificationRun',
      actor: agent?.name || agentId,
      bundleId,
      targetId: agentId,
      summary: `${agent?.name || agentId} を実行（昇格候補 ${promotionCandidates.length} 件抽出）`,
      payload: { executedCli, candidatesCount: promotionCandidates.length },
    });

    await this.saveState(vault, bundleId, nextState);
    return {
      reply,
      addedCandidatesCount: promotionCandidates.length,
      executedCli,
      state: nextState,
    };
  }
}

export const operationsService = new OperationsService();
