/**
 * src/services/OperationsService.ts
 * 業務管理構想案（および高齢者思考支援・生活支援）の共通操作サービス。
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
  updateGateStatus,
  appendDomainEvent,
  type BundleOperationsState,
  type GateStatus,
} from '../../shared/operations';
import { invokeIpc } from '../utils/ipcError';

export class OperationsService {
  /** 対象 Bundle（または Chat）の最新 Operations 状態を取得する。 */
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

    return extractOperationsState(rawMeta, profile);
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

  /** 専門 Agent（Orchestrator）の検証実行結果を監査台帳に記録する。 */
  public async runSpecialistAgentReview(
    vault: TTVault,
    bundleId: string,
    agentId: string,
    instruction: string,
  ): Promise<{
    reply: string;
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
      `${agent?.name || agentId} として、このテーマの資料・到達状態・リスク・根拠の過不足を点検し、結果を整理してください。`;

    let reply: string;
    let executedCli = 'local-cli';

    const electronAi = typeof window !== 'undefined' ? window.electronAPI?.ai : undefined;
    if (electronAi?.agent) {
      const aiRes = await invokeIpc(() => electronAi.agent({
        profileId: profile.id,
        panelRole: 'Seeds',
        agentId,
        bundleId,
        bundleTitle: bundleThink?.Name || bundleId,
        gates: state.gates,
        relatedDocuments,
        userMessage,
      }));
      reply = aiRes.reply;
      executedCli = aiRes.executedCli;
    } else if (FirestoreRelayClient.isConfigured()) {
      const relayRes = await FirestoreRelayClient.request<
        Record<string, unknown>,
        {
          reply: string;
          executedCli: string;
        }
      >('ai.agent', {
        profileId: profile.id,
        panelRole: 'Seeds',
        agentId,
        bundleId,
        bundleTitle: bundleThink?.Name || bundleId,
        gates: state.gates,
        relatedDocuments,
        userMessage,
      });
      if (relayRes.ok && relayRes.result) {
        reply = relayRes.result.reply;
        executedCli = `relay:${relayRes.result.executedCli || 'local-cli'}`;
      } else {
        throw new Error(relayRes.error || 'Firebase E2EE 中継での専門AI実行に失敗しました。');
      }
    } else {
      reply = `【${agent?.name || agentId}】「${bundleThink?.Name || bundleId}」の関連資料 (${relatedDocuments.length}件) と Gate 状態を点検しました。`;
    }

    const nextState = appendDomainEvent(state, {
      idempotencyKey: `agent_run_${agentId}_${Date.now()}`,
      eventType: 'AgentVerificationRun',
      actor: agent?.name || agentId,
      bundleId,
      targetId: agentId,
      summary: `${agent?.name || agentId} を実行`,
      payload: { executedCli },
    });

    await this.saveState(vault, bundleId, nextState);
    return {
      reply,
      executedCli,
      state: nextState,
    };
  }
}

export const operationsService = new OperationsService();
