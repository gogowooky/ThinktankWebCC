/**
 * src/components/SeedsPanel/ProgramOperationsPanel.tsx
 * Seedsパネル（Program Master / 暮らしのテーマ）における統合業務管理・思考支援コンポーネント。
 * - ドメインプロファイル切替（clinical-trial ⇔ elderly-support）
 * - Program Gate 管理（通過ガード・ブロッカー管理）
 * - 専門 AI Agent 協働実行（Orchestrator）
 * - イベント駆動の監査履歴（Compliance Ledger）
 */

import { useEffect, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useDomainProfile } from '../../platform/DomainProfileManager';
import { operationsService } from '../../services/OperationsService';
import type { BundleOperationsState, GateStatus } from '../../../shared/operations';
import { useAppUpdate } from '../../hooks/useAppUpdate';

interface ProgramOperationsPanelProps {
  vault: TTVault;
  bundleId: string;
}

export function ProgramOperationsPanel({ vault, bundleId }: ProgramOperationsPanelProps) {
  useAppUpdate(vault);
  const { profile, availableProfiles, switchProfile } = useDomainProfile();
  const [opsState, setOpsState] = useState<BundleOperationsState | null>(null);
  const [reviewer, setReviewer] = useState('責任者');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agentInstruction, setAgentInstruction] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentReply, setAgentReply] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  async function loadState() {
    const state = await operationsService.getState(vault, bundleId);
    setOpsState(state);
  }

  useEffect(() => {
    void loadState();
  }, [vault, bundleId, profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile.agents.length > 0 && !profile.agents.some((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(profile.agents[0].id);
    }
  }, [profile, selectedAgentId]);

  if (!opsState) return null;

  async function handleGateChange(gateId: string, nextStatus: GateStatus) {
    setStatusMsg('');
    const res = await operationsService.updateGate(vault, bundleId, {
      gateId,
      status: nextStatus,
      reviewer,
      linkedRecordIds: [],
    });
    if (!res.ok) {
      setStatusMsg(res.error || 'Gate 変更に失敗しました。');
      return;
    }
    setOpsState(res.state);
    setStatusMsg(`Gate「${gateId}」を ${nextStatus} に更新しました。`);
  }

  async function handleRunAgent() {
    if (!selectedAgentId || agentRunning) return;
    setAgentRunning(true);
    setAgentReply('');
    setStatusMsg('');
    try {
      const res = await operationsService.runSpecialistAgentReview(
        vault,
        bundleId,
        selectedAgentId,
        agentInstruction,
      );
      setAgentReply(res.reply);
      setOpsState(res.state);
      setStatusMsg(`Agent（${res.executedCli}）を実行しました。`);
    } catch (e) {
      setStatusMsg((e as Error).message || 'Agent 実行に失敗しました。');
    } finally {
      setAgentRunning(false);
    }
  }

  return (
    <section
      className="program-operations-panel"
      aria-label={profile.terminology.programUnit}
      style={{
        border: '1px solid var(--field-border, rgba(135, 57, 96, 0.28))',
        backgroundColor: 'var(--field-surface, #ffffff)',
        color: 'var(--field-text, #16161f)',
        borderRadius: 6,
        padding: 10,
        margin: '10px 0',
        fontSize: '0.84rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid var(--field-border, rgba(135, 57, 96, 0.22))',
          paddingBottom: 6,
          marginBottom: 8,
        }}
      >
        <div>
          <strong>運用プロファイル：{profile.name}</strong>
          <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{profile.subtitle}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '0.76rem' }}>
            プロファイル切替:{' '}
            <select
              aria-label="運用プロファイル切替"
              value={profile.id}
              onChange={(e) => void switchProfile(e.target.value)}
              style={{ fontSize: '0.78rem' }}
            >
              {availableProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '0.76rem' }}>
            確認者:{' '}
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              style={{ width: 85, fontSize: '0.76rem', padding: '1px 4px' }}
            />
          </label>
        </div>
      </div>

      {statusMsg && (
        <p role="status" style={{ margin: '6px 0', color: 'var(--field-accent, #873960)', fontWeight: 600 }}>
          {statusMsg}
        </p>
      )}

      {/* 1. Program Gate・段階到達確認 */}
      <details open style={{ marginBottom: 8 }}>
        <summary style={{ fontWeight: 600, cursor: 'pointer' }}>
          {profile.terminology.gateSectionTitle}
        </summary>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {opsState.gates.map((gate) => (
            <div
              key={gate.gateId}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                border: '1px solid rgba(128,128,128,0.25)',
                borderRadius: 4,
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong>{gate.label}</strong>
                <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{gate.description}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select
                  aria-label={`${gate.label}の状態`}
                  value={gate.status}
                  onChange={(e) =>
                    void handleGateChange(gate.gateId, e.target.value as GateStatus)
                  }
                  style={{ fontSize: '0.76rem' }}
                >
                  <option value="open">未着手 (open)</option>
                  <option value="in_review">確認中 (in_review)</option>
                  <option value="passed">通過承認済 (passed)</option>
                  <option value="blocked">保留・阻害要因あり (blocked)</option>
                </select>
                {gate.reviewer && (
                  <span style={{ fontSize: '0.72rem', opacity: 0.75 }}>
                    ({gate.reviewer})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>

      {/* 2. 専門AI Agent 協働実行（Orchestrator） */}
      <details style={{ marginBottom: 8 }}>
        <summary style={{ fontWeight: 600, cursor: 'pointer' }}>
          {profile.terminology.orchestratorSectionTitle}
        </summary>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <select
              aria-label="専門Agent選択"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              style={{ fontSize: '0.78rem' }}
            >
              {profile.agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} — {ag.description}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={agentRunning}
              onClick={() => void handleRunAgent()}
            >
              {agentRunning ? 'ローカル AI CLI で点検中…' : '専門Agentで点検'}
            </button>
          </div>
          <input
            type="text"
            placeholder="追加の指示（省略時はプロファイル標準の観点で点検します）"
            value={agentInstruction}
            onChange={(e) => setAgentInstruction(e.target.value)}
            style={{ fontSize: '0.78rem', padding: '3px 6px' }}
          />
          {agentReply && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.78rem',
                padding: 8,
                background: 'var(--field-bg, #f9f3f6)',
                border: '1px solid var(--field-border, rgba(135, 57, 96, 0.25))',
                color: 'var(--field-text, #16161f)',
                borderRadius: 4,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {agentReply}
            </pre>
          )}
        </div>
      </details>

      {/* 3. 監査イベント履歴（Compliance Ledger） */}
      <details>
        <summary style={{ fontWeight: 600, cursor: 'pointer' }}>
          {profile.terminology.auditSectionTitle}（{opsState.complianceLedger.length}件）
        </summary>
        {opsState.complianceLedger.length === 0 ? (
          <p style={{ fontSize: '0.76rem', opacity: 0.75, marginTop: 4 }}>
            まだ監査イベントは記録されていません。
          </p>
        ) : (
          <ul
            style={{
              margin: '6px 0 0 0',
              padding: 0,
              listStyle: 'none',
              maxHeight: 180,
              overflowY: 'auto',
              fontSize: '0.75rem',
            }}
          >
            {opsState.complianceLedger.slice(0, 40).map((ev) => (
              <li
                key={ev.eventId}
                style={{
                  borderBottom: '1px solid rgba(128,128,128,0.18)',
                  padding: '3px 0',
                }}
              >
                <code>{ev.timestamp.slice(0, 19).replace('T', ' ')}</code>{' '}
                <strong>[{ev.eventType}]</strong> {ev.summary}{' '}
                <span style={{ opacity: 0.75 }}>(by {ev.actor})</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
