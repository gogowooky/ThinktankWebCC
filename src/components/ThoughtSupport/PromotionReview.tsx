/**
 * src/components/ThoughtSupport/PromotionReview.tsx
 * 独立Chatから抽出された「昇格候補（Promotion Candidate）」を人間がレビューし、
 * 公式レコード（Promoted Record: Decision / Evidence / Risk / Assumption / Action / GateResult / Learning）へ
 * 承認・昇格または却下するUIコンポーネント（業務管理構想案 §4・§5 準拠）。
 */

import { useEffect, useState } from 'react';
import type { TTVault } from '../../models/TTVault';
import { useDomainProfile } from '../../platform/DomainProfileManager';
import { operationsService } from '../../services/OperationsService';
import { getTurnPromotionCandidates } from '../../services/ConversationService';
import { PROMOTION_KINDS, type PromotionKind } from '../../../shared/domainProfile';
import type { PromotionCandidate, PromotedRecord } from '../../../shared/operations';

interface PromotionReviewProps {
  vault: TTVault;
  bundleId?: string;
  chatId?: string;
  turnId?: string;
  disabled?: boolean;
  onOpen: (id: string) => void;
}

export function PromotionReview({
  vault,
  bundleId,
  chatId,
  turnId,
  disabled = false,
  onOpen,
}: PromotionReviewProps) {
  const { profile } = useDomainProfile();
  const targetBundleId = bundleId || chatId || '';
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [activeRecords, setActiveRecords] = useState<PromotedRecord[]>([]);
  const [reviewerName, setReviewerName] = useState('責任者');
  const [deciderMap, setDeciderMap] = useState<Record<string, string>>({});
  const [rationaleMap, setRationaleMap] = useState<Record<string, string>>({});
  const [supersedeMap, setSupersedeMap] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualKind, setManualKind] = useState<PromotionKind>('decision');
  const [manualTitle, setManualTitle] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualRationale, setManualRationale] = useState('');

  async function reload() {
    if (!targetBundleId) return;
    const state = await operationsService.getState(vault, targetBundleId);
    const pending = state.promotionCandidates.filter(
      (c) =>
        c.status === 'pending_review' &&
        (!turnId || !c.sourceMessageId || c.sourceMessageId === turnId),
    );
    setCandidates(pending);
    setActiveRecords(state.promotedRecords.filter((r) => r.status !== 'superseded'));
  }

  useEffect(() => {
    void reload();
  }, [vault, targetBundleId, turnId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Turn にインメモリ候補があり、まだ operations に未登録なら登録する
  useEffect(() => {
    if (!turnId || !targetBundleId) return;
    const turnCands = getTurnPromotionCandidates(turnId);
    if (turnCands.length > 0) {
      void operationsService
        .addCandidatesFromAi(vault, targetBundleId, turnCands, chatId, turnId)
        .then(() => reload());
    }
  }, [turnId, targetBundleId, chatId, vault]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!targetBundleId) return null;

  async function handleApprove(cand: PromotionCandidate) {
    setFeedback('');
    const kindCfg = profile.promotionKinds[cand.type];
    const ownerOrDecider = (deciderMap[cand.id] ?? cand.proposedOwner ?? reviewerName).trim();
    const rationale = (rationaleMap[cand.id] ?? cand.rationale ?? cand.summary).trim();

    if (kindCfg?.requiresDecider && !ownerOrDecider) {
      setFeedback(`「${kindCfg.label}」の承認には決定者（Decision Maker）の入力が必須です。`);
      return;
    }

    const res = await operationsService.approveCandidate(vault, targetBundleId, {
      candidateId: cand.id,
      approvedBy: reviewerName || '人間レビュアー',
      ownerOrDecisionMaker: ownerOrDecider,
      rationale,
      supersedesRecordId: supersedeMap[cand.id] || undefined,
    });

    if (!res.ok) {
      setFeedback(res.error || '承認に失敗しました。');
      return;
    }
    setFeedback(`「${cand.title}」を公式レコード（v${res.record?.version ?? 1}）へ昇格承認しました。`);
    await reload();
  }

  async function handleReject(cand: PromotionCandidate) {
    setFeedback('');
    await operationsService.rejectCandidate(
      vault,
      targetBundleId,
      cand.id,
      reviewerName || '人間レビュアー',
      '会話内レビューで却下',
    );
    setFeedback(`「${cand.title}」を却下しました。`);
    await reload();
  }

  async function handleAddManual() {
    if (!manualTitle.trim() || !manualSummary.trim()) {
      setFeedback('タイトルと要旨を入力してください。');
      return;
    }
    await operationsService.addCandidate(
      vault,
      targetBundleId,
      {
        bundleId: targetBundleId,
        sourceChatThinkid: chatId,
        sourceMessageId: turnId,
        type: manualKind,
        title: manualTitle.trim(),
        summary: manualSummary.trim(),
        rationale: manualRationale.trim() || undefined,
        citations: chatId ? [{ sourceThinkid: chatId, sourceTitle: 'このChat' }] : [],
        createdBy: 'human',
      },
      reviewerName || 'human',
    );
    setManualTitle('');
    setManualSummary('');
    setManualRationale('');
    setShowManualForm(false);
    setFeedback('昇格候補を追加しました。内容を確認して承認してください。');
    await reload();
  }

  if (candidates.length === 0 && !showManualForm) {
    return (
      <div className="promotion-review promotion-review--compact" style={{ marginTop: 6 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowManualForm(true)}
          style={{ fontSize: '0.78rem', opacity: 0.85 }}
        >
          ＋ {profile.terminology.promotionSectionTitle}を作成
        </button>
        {feedback && <span style={{ marginLeft: 8, fontSize: '0.78rem' }}>{feedback}</span>}
      </div>
    );
  }

  return (
    <section
      className="promotion-review"
      aria-label={profile.terminology.promotionSectionTitle}
      style={{
        border: '1px solid var(--field-border, rgba(135, 57, 96, 0.28))',
        backgroundColor: 'var(--field-bg, #faf5f7)',
        color: 'var(--field-text, #16161f)',
        borderRadius: 6,
        padding: '8px 10px',
        marginTop: 8,
        fontSize: '0.82rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <strong>{profile.terminology.promotionSectionTitle}（未承認 {candidates.length}件）</strong>
        <label style={{ fontSize: '0.76rem' }}>
          承認者:{' '}
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            style={{ width: 90, fontSize: '0.76rem', padding: '1px 4px' }}
          />
        </label>
      </div>

      {feedback && (
        <p role="status" style={{ margin: '4px 0', color: 'var(--field-accent, #873960)', fontWeight: 600 }}>
          {feedback}
        </p>
      )}

      {candidates.map((cand) => {
        const kindCfg = profile.promotionKinds[cand.type];
        const sameTypeRecords = activeRecords.filter((r) => r.type === cand.type);
        return (
          <div
            key={cand.id}
            style={{
              borderTop: '1px solid rgba(128,128,128,0.25)',
              paddingTop: 6,
              marginTop: 6,
            }}
          >
            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(96, 165, 250, 0.18)',
                  marginRight: 6,
                  fontWeight: 600,
                }}
              >
                {kindCfg?.label || cand.type}
              </span>
              <strong>{cand.title}</strong>
            </div>
            <p style={{ margin: '4px 0' }}>{cand.summary}</p>
            {cand.citations.length > 0 && (
              <div style={{ fontSize: '0.75rem', marginBottom: 4 }}>
                根拠引用:{' '}
                {cand.citations.map((cit, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onOpen(cit.sourceThinkid)}
                    style={{ marginRight: 4, fontSize: '0.74rem' }}
                  >
                    [{cit.sourceTitle || cit.sourceThinkid}]
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <input
                type="text"
                placeholder={kindCfg?.requiresDecider ? '決定者（必須）' : '担当者 / 決定者'}
                value={deciderMap[cand.id] ?? cand.proposedOwner ?? ''}
                onChange={(e) =>
                  setDeciderMap((prev) => ({ ...prev, [cand.id]: e.target.value }))
                }
                style={{ width: 130, fontSize: '0.76rem', padding: '2px 4px' }}
              />
              <input
                type="text"
                placeholder="採用理由・根拠メモ（Decisionは必須）"
                value={rationaleMap[cand.id] ?? cand.rationale ?? ''}
                onChange={(e) =>
                  setRationaleMap((prev) => ({ ...prev, [cand.id]: e.target.value }))
                }
                style={{ flex: 1, minWidth: 160, fontSize: '0.76rem', padding: '2px 4px' }}
              />
              {sameTypeRecords.length > 0 && (
                <select
                  aria-label="改訂対象レコード"
                  value={supersedeMap[cand.id] ?? ''}
                  onChange={(e) =>
                    setSupersedeMap((prev) => ({ ...prev, [cand.id]: e.target.value }))
                  }
                  style={{ fontSize: '0.75rem' }}
                >
                  <option value="">新規登録（v1）</option>
                  {sameTypeRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      改訂: {r.title} (v{r.version}→v{r.version + 1})
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => void handleApprove(cand)}
              >
                承認して昇格
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void handleReject(cand)}
              >
                却下
              </button>
            </div>
          </div>
        );
      })}

      {showManualForm ? (
        <div
          style={{
            borderTop: '1px dashed rgba(128,128,128,0.4)',
            marginTop: 8,
            paddingTop: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={manualKind}
              onChange={(e) => setManualKind(e.target.value as PromotionKind)}
              style={{ fontSize: '0.76rem' }}
            >
              {PROMOTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {profile.promotionKinds[k]?.label || k}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="タイトル（例: 非臨床安全性パッケージ方針）"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              style={{ flex: 1, fontSize: '0.76rem', padding: '2px 4px' }}
            />
          </div>
          <input
            type="text"
            placeholder="内容・要旨"
            value={manualSummary}
            onChange={(e) => setManualSummary(e.target.value)}
            style={{ fontSize: '0.76rem', padding: '2px 4px' }}
          />
          <input
            type="text"
            placeholder="決定理由・背景・影響範囲"
            value={manualRationale}
            onChange={(e) => setManualRationale(e.target.value)}
            style={{ fontSize: '0.76rem', padding: '2px 4px' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => void handleAddManual()}>
              候補として追加
            </button>
            <button type="button" onClick={() => setShowManualForm(false)}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowManualForm(true)}
            style={{ fontSize: '0.75rem' }}
          >
            ＋ 手動で昇格候補を追加
          </button>
        </div>
      )}
    </section>
  );
}
