/**
 * shared/operations.ts
 * 業務管理構想案（および高齢者思考・生活支援）における共通ドメイン操作ロジック。
 * - 独立Chatからの「情報の昇格（Promotion Mechanism）」
 * - 版管理（Supersede）と引用元変更時の再検証検知（needs_revalidation）
 * - イベント駆動の監査台帳（Domain Event / Compliance Ledger、Idempotency Key対応）
 * - Program Gate 管理と通過条件検証
 */

import type { DomainProfile, PromotionTargetType } from './domainProfile';

export type PromotionCandidateStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'needs_revalidation';

export interface CitationRef {
  sourceThinkid: string;
  sourceTitle?: string;
  /** 承認時点または抽出時点の本文 SHA-256（または updatedAt 識別子） */
  sourceVersionToken?: string;
  snippet?: string;
}

export interface PromotionCandidate {
  id: string;
  bundleId: string;
  sourceChatThinkid?: string;
  sourceMessageId?: string;
  type: PromotionTargetType;
  title: string;
  summary: string;
  /** Decision の場合の決定案・理由、Risk の場合の影響度や対策案など */
  rationale?: string;
  impactScope?: string;
  proposedOwner?: string;
  dueDate?: string;
  citations: CitationRef[];
  confidence?: number;
  createdAt: string;
  createdBy: 'ai' | 'human';
  status: PromotionCandidateStatus;
}

export interface PromotedRecord {
  id: string;
  bundleId: string;
  candidateId: string;
  type: PromotionTargetType;
  version: number;
  supersedesId?: string;
  supersededById?: string;
  title: string;
  summary: string;
  rationale: string;
  impactScope: string;
  /** Decision の場合は決定者、Action/Risk の場合は担当者 */
  ownerOrDecisionMaker: string;
  dueDate?: string;
  citations: CitationRef[];
  status: 'active' | 'superseded' | 'needs_revalidation';
  revalidationReason?: string;
  approvedBy: string;
  approvedAt: string;
  sourceChatThinkid?: string;
}

export type GateStatus = 'open' | 'in_review' | 'passed' | 'blocked';

export interface GateRecord {
  gateId: string;
  label: string;
  description: string;
  criteria: string[];
  status: GateStatus;
  linkedRecordIds: string[];
  blockers: string[];
  reviewer?: string;
  reviewedAt?: string;
  notes?: string;
}

export type DomainEventType =
  | 'PromotionCandidateCreated'
  | 'PromotionApproved'
  | 'PromotionRejected'
  | 'RecordSuperseded'
  | 'SourceDocumentUpdated'
  | 'RevalidationResolved'
  | 'GateStatusChanged'
  | 'AgentVerificationRun'
  | 'DomainProfileSwitched';

export interface DomainEvent {
  eventId: string;
  idempotencyKey: string;
  eventType: DomainEventType;
  timestamp: string;
  actor: string;
  bundleId: string;
  targetId: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface BundleOperationsState {
  profileId?: string;
  promotionCandidates: PromotionCandidate[];
  promotedRecords: PromotedRecord[];
  gates: GateRecord[];
  complianceLedger: DomainEvent[];
}

export function createEmptyOperationsState(profile?: DomainProfile): BundleOperationsState {
  const gates: GateRecord[] = profile
    ? profile.milestones.map((m) => ({
        gateId: m.milestone,
        label: m.label,
        description: m.gateDescription,
        criteria: [m.gateDescription],
        status: 'open',
        linkedRecordIds: [],
        blockers: [],
      }))
    : [];

  return {
    profileId: profile?.id,
    promotionCandidates: [],
    promotedRecords: [],
    gates,
    complianceLedger: [],
  };
}

/**
 * metadata オブジェクト内の operations 状態を安全に取り出す。
 * ドメインプロファイルが指定されていれば未初期化の Gate 定義を補完する。
 */
export function extractOperationsState(
  metadata: Record<string, unknown> | undefined,
  profile?: DomainProfile,
): BundleOperationsState {
  const raw =
    metadata && typeof metadata.operations === 'object' && metadata.operations !== null
      ? (metadata.operations as Record<string, unknown>)
      : {};

  const promotionCandidates = Array.isArray(raw.promotionCandidates)
    ? (raw.promotionCandidates as PromotionCandidate[])
    : [];
  const promotedRecords = Array.isArray(raw.promotedRecords)
    ? (raw.promotedRecords as PromotedRecord[])
    : [];
  const complianceLedger = Array.isArray(raw.complianceLedger)
    ? (raw.complianceLedger as DomainEvent[])
    : [];

  let gates = Array.isArray(raw.gates) ? (raw.gates as GateRecord[]) : [];
  if (profile && gates.length === 0) {
    gates = profile.milestones.map((m) => ({
      gateId: m.milestone,
      label: m.label,
      description: m.gateDescription,
      criteria: [m.gateDescription],
      status: 'open',
      linkedRecordIds: [],
      blockers: [],
    }));
  }

  return {
    profileId: typeof raw.profileId === 'string' ? raw.profileId : profile?.id,
    promotionCandidates,
    promotedRecords,
    gates,
    complianceLedger,
  };
}

/**
 * 冪等キー（idempotencyKey）を用いて重複を防ぎながら監査台帳へイベントを追記する。
 */
export function appendDomainEvent(
  state: BundleOperationsState,
  event: Omit<DomainEvent, 'eventId' | 'timestamp'> & { eventId?: string; timestamp?: string },
): BundleOperationsState {
  if (state.complianceLedger.some((e) => e.idempotencyKey === event.idempotencyKey)) {
    return state;
  }
  const timestamp = event.timestamp ?? new Date().toISOString();
  const eventId = event.eventId ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullEvent: DomainEvent = {
    ...event,
    eventId,
    timestamp,
  };
  return {
    ...state,
    complianceLedger: [fullEvent, ...state.complianceLedger],
  };
}

/**
 * 昇格候補（PromotionCandidate）を追加する。
 */
export function addPromotionCandidate(
  state: BundleOperationsState,
  candidateInput: Omit<PromotionCandidate, 'id' | 'createdAt' | 'status'> & {
    id?: string;
    createdAt?: string;
  },
  actor = 'ai',
): BundleOperationsState {
  const id = candidateInput.id ?? `cand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = candidateInput.createdAt ?? new Date().toISOString();
  const candidate: PromotionCandidate = {
    ...candidateInput,
    id,
    createdAt,
    status: 'pending_review',
  };

  const nextState: BundleOperationsState = {
    ...state,
    promotionCandidates: [candidate, ...state.promotionCandidates],
  };

  return appendDomainEvent(nextState, {
    idempotencyKey: `cand_create_${id}`,
    eventType: 'PromotionCandidateCreated',
    actor,
    bundleId: candidate.bundleId,
    targetId: id,
    summary: `昇格候補「${candidate.title}」(${candidate.type}) を抽出`,
    payload: { type: candidate.type, sourceChatThinkid: candidate.sourceChatThinkid },
  });
}

export interface ApprovePromotionParams {
  candidateId: string;
  approvedBy: string;
  ownerOrDecisionMaker: string;
  rationale: string;
  impactScope?: string;
  title?: string;
  summary?: string;
  dueDate?: string;
  citations?: CitationRef[];
  /** 既存レコードを改訂（Supersede）する場合の旧レコードID */
  supersedesRecordId?: string;
  nowIso?: string;
}

export interface ApprovePromotionResult {
  ok: boolean;
  error?: string;
  state: BundleOperationsState;
  record?: PromotedRecord;
}

/**
 * 昇格候補を人間がレビューして公式レコード（PromotedRecord）へ昇格させる。
 * - Decision の場合は決定者（ownerOrDecisionMaker）と理由（rationale）が必須。
 * - 既存レコードの改訂（supersedesRecordId）時は旧版を superseded に変更し、version を +1 する。
 */
export function approvePromotionCandidate(
  state: BundleOperationsState,
  params: ApprovePromotionParams,
): ApprovePromotionResult {
  const candidate = state.promotionCandidates.find((c) => c.id === params.candidateId);
  if (!candidate) {
    return { ok: false, error: `昇格候補が見つかりません: ${params.candidateId}`, state };
  }

  const approver = params.approvedBy.trim();
  if (!approver) {
    return { ok: false, error: '承認者（Reviewer）の入力が必要です。', state };
  }

  const owner = params.ownerOrDecisionMaker.trim() || (candidate.proposedOwner ?? '').trim();
  const rationale = params.rationale.trim() || (candidate.rationale ?? '').trim();

  if (candidate.type === 'decision') {
    if (!owner) {
      return {
        ok: false,
        error: '重要決定（Decision）の昇格には、決定者（Decision Maker）の明記が必須です。',
        state,
      };
    }
    if (!rationale) {
      return {
        ok: false,
        error: '重要決定（Decision）の昇格には、決定理由・背景（Rationale）の明記が必須です。',
        state,
      };
    }
  }

  const nowIso = params.nowIso ?? new Date().toISOString();
  const recordId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let version = 1;
  let updatedRecords = [...state.promotedRecords];

  if (params.supersedesRecordId) {
    const prevIdx = updatedRecords.findIndex((r) => r.id === params.supersedesRecordId);
    if (prevIdx >= 0) {
      const prev = updatedRecords[prevIdx];
      version = prev.version + 1;
      updatedRecords[prevIdx] = {
        ...prev,
        status: 'superseded',
        supersededById: recordId,
      };
    }
  }

  const newRecord: PromotedRecord = {
    id: recordId,
    bundleId: candidate.bundleId,
    candidateId: candidate.id,
    type: candidate.type,
    version,
    supersedesId: params.supersedesRecordId,
    title: (params.title ?? candidate.title).trim(),
    summary: (params.summary ?? candidate.summary).trim(),
    rationale: rationale || '（承認時コメントなし）',
    impactScope: (params.impactScope ?? candidate.impactScope ?? 'Bundle全体').trim(),
    ownerOrDecisionMaker: owner || approver,
    dueDate: params.dueDate ?? candidate.dueDate,
    citations: params.citations ?? candidate.citations,
    status: 'active',
    approvedBy: approver,
    approvedAt: nowIso,
    sourceChatThinkid: candidate.sourceChatThinkid,
  };

  updatedRecords = [newRecord, ...updatedRecords];

  const updatedCandidates = state.promotionCandidates.map((c) =>
    c.id === candidate.id ? { ...c, status: 'approved' as const } : c,
  );

  let nextState: BundleOperationsState = {
    ...state,
    promotionCandidates: updatedCandidates,
    promotedRecords: updatedRecords,
  };

  if (params.supersedesRecordId) {
    nextState = appendDomainEvent(nextState, {
      idempotencyKey: `rec_supersede_${params.supersedesRecordId}_by_${recordId}`,
      eventType: 'RecordSuperseded',
      timestamp: nowIso,
      actor: approver,
      bundleId: candidate.bundleId,
      targetId: params.supersedesRecordId,
      summary: `レコード「${newRecord.title}」を v${version} に改訂（旧版: ${params.supersedesRecordId}）`,
      payload: { oldRecordId: params.supersedesRecordId, newRecordId: recordId, version },
    });
  }

  nextState = appendDomainEvent(nextState, {
    idempotencyKey: `cand_approve_${candidate.id}_${recordId}`,
    eventType: 'PromotionApproved',
    timestamp: nowIso,
    actor: approver,
    bundleId: candidate.bundleId,
    targetId: recordId,
    summary: `「${newRecord.title}」(${newRecord.type} v${version}) を公式レコードに昇格承認`,
    payload: {
      candidateId: candidate.id,
      type: newRecord.type,
      ownerOrDecisionMaker: newRecord.ownerOrDecisionMaker,
    },
  });

  return { ok: true, state: nextState, record: newRecord };
}

/**
 * 昇格候補を却下（Reject）する。
 */
export function rejectPromotionCandidate(
  state: BundleOperationsState,
  candidateId: string,
  actor: string,
  reason = '',
): BundleOperationsState {
  const candidate = state.promotionCandidates.find((c) => c.id === candidateId);
  if (!candidate) return state;

  const updatedCandidates = state.promotionCandidates.map((c) =>
    c.id === candidateId ? { ...c, status: 'rejected' as const } : c,
  );

  const nextState: BundleOperationsState = {
    ...state,
    promotionCandidates: updatedCandidates,
  };

  return appendDomainEvent(nextState, {
    idempotencyKey: `cand_reject_${candidateId}`,
    eventType: 'PromotionRejected',
    actor: actor.trim() || 'human',
    bundleId: candidate.bundleId,
    targetId: candidateId,
    summary: `昇格候補「${candidate.title}」を却下${reason ? `: ${reason}` : ''}`,
    payload: { reason },
  });
}

/**
 * 引用元メモの最新バージョントークン（updatedAt または本文 SHA-256）のマップと照合し、
 * 承認時点から引用元が書き換わっている Active レコードを `needs_revalidation`（根拠再確認待ち）にする。
 */
export function detectRevalidationNeeded(
  state: BundleOperationsState,
  currentSourceTokens: ReadonlyMap<string, string>,
  actor = 'system',
): { state: BundleOperationsState; affectedRecordIds: string[] } {
  const affectedRecordIds: string[] = [];

  const updatedRecords = state.promotedRecords.map((rec) => {
    if (rec.status !== 'active') return rec;
    for (const cit of rec.citations) {
      if (!cit.sourceVersionToken) continue;
      const latestToken = currentSourceTokens.get(cit.sourceThinkid);
      if (latestToken && latestToken !== cit.sourceVersionToken) {
        affectedRecordIds.push(rec.id);
        return {
          ...rec,
          status: 'needs_revalidation' as const,
          revalidationReason: `引用元「${cit.sourceTitle || cit.sourceThinkid}」が更新されました（旧: ${cit.sourceVersionToken} → 新: ${latestToken}）`,
        };
      }
    }
    return rec;
  });

  if (affectedRecordIds.length === 0) {
    return { state, affectedRecordIds: [] };
  }

  let nextState: BundleOperationsState = {
    ...state,
    promotedRecords: updatedRecords,
  };

  for (const recId of affectedRecordIds) {
    const rec = updatedRecords.find((r) => r.id === recId)!;
    nextState = appendDomainEvent(nextState, {
      idempotencyKey: `reval_${recId}_${rec.revalidationReason}`,
      eventType: 'SourceDocumentUpdated',
      actor,
      bundleId: rec.bundleId,
      targetId: recId,
      summary: `引用元更新により「${rec.title}」が根拠再確認待ちになりました`,
      payload: { reason: rec.revalidationReason },
    });
  }

  return { state: nextState, affectedRecordIds };
}

/**
 * `needs_revalidation` 状態のレコードについて、人間が最新の引用元を確認して Active に戻す。
 */
export function resolveRevalidation(
  state: BundleOperationsState,
  recordId: string,
  reviewer: string,
  latestSourceTokens?: ReadonlyMap<string, string>,
): BundleOperationsState {
  const target = state.promotedRecords.find((r) => r.id === recordId);
  if (!target || target.status !== 'needs_revalidation') return state;

  const updatedRecords = state.promotedRecords.map((rec) => {
    if (rec.id !== recordId) return rec;
    const updatedCitations = latestSourceTokens
      ? rec.citations.map((cit) => ({
          ...cit,
          sourceVersionToken: latestSourceTokens.get(cit.sourceThinkid) ?? cit.sourceVersionToken,
        }))
      : rec.citations;
    return {
      ...rec,
      status: 'active' as const,
      revalidationReason: undefined,
      citations: updatedCitations,
    };
  });

  const nextState: BundleOperationsState = {
    ...state,
    promotedRecords: updatedRecords,
  };

  return appendDomainEvent(nextState, {
    idempotencyKey: `reval_resolve_${recordId}_${Date.now()}`,
    eventType: 'RevalidationResolved',
    actor: reviewer.trim() || 'human',
    bundleId: target.bundleId,
    targetId: recordId,
    summary: `「${target.title}」の根拠再確認を完了し Active に復帰`,
  });
}

/**
 * Program Gate の状態を更新する。
 * `passed` に変更しようとした際、紐づくレコードに `needs_revalidation` があるか、
 * 未解決の blocker がある場合はエラーを返す。
 */
export function updateGateStatus(
  state: BundleOperationsState,
  params: {
    gateId: string;
    bundleId: string;
    status: GateStatus;
    reviewer: string;
    notes?: string;
    blockers?: string[];
    linkedRecordIds?: string[];
  },
): { ok: boolean; error?: string; state: BundleOperationsState } {
  const gateIdx = state.gates.findIndex((g) => g.gateId === params.gateId);
  if (gateIdx < 0) {
    return { ok: false, error: `Gate が見つかりません: ${params.gateId}`, state };
  }

  const currentGate = state.gates[gateIdx];
  const nextBlockers = params.blockers ?? currentGate.blockers;
  const nextLinkedIds = params.linkedRecordIds ?? currentGate.linkedRecordIds;

  if (params.status === 'passed') {
    if (!params.reviewer.trim()) {
      return { ok: false, error: 'Gate 通過承認には確認者（Reviewer）の指定が必須です。', state };
    }
    if (nextBlockers.length > 0) {
      return {
        ok: false,
        error: `未解決のブロッカーが ${nextBlockers.length} 件残っているため Gate を通過できません。`,
        state,
      };
    }
    const revalRecords = state.promotedRecords.filter(
      (r) => nextLinkedIds.includes(r.id) && r.status === 'needs_revalidation',
    );
    if (revalRecords.length > 0) {
      return {
        ok: false,
        error: `紐づく根拠レコード（${revalRecords.map((r) => r.title).join(', ')}）が再確認待ちのため Gate を通過できません。`,
        state,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const updatedGate: GateRecord = {
    ...currentGate,
    status: params.status,
    blockers: nextBlockers,
    linkedRecordIds: nextLinkedIds,
    reviewer: params.reviewer.trim() || currentGate.reviewer,
    reviewedAt: nowIso,
    notes: params.notes ?? currentGate.notes,
  };

  const nextGates = [...state.gates];
  nextGates[gateIdx] = updatedGate;

  let nextState: BundleOperationsState = {
    ...state,
    gates: nextGates,
  };

  nextState = appendDomainEvent(nextState, {
    idempotencyKey: `gate_${params.gateId}_${params.status}_${nowIso}`,
    eventType: 'GateStatusChanged',
    timestamp: nowIso,
    actor: params.reviewer.trim() || 'human',
    bundleId: params.bundleId,
    targetId: params.gateId,
    summary: `Gate「${updatedGate.label}」の状態を ${params.status} に更新`,
    payload: { status: params.status, notes: params.notes },
  });

  return { ok: true, state: nextState };
}
