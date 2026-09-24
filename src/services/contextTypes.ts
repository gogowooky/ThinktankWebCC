import type { ThinkSupportRecord } from '../../server/services/thinkSupportRecord';
import type { SubtaskContext, ProgressContext } from '../../server/services/subtaskContext';
/** Detached, immutable read models; no persistence or provider dependency. */
export type ContextIssueCode = 'cycle' | 'missing_think' | 'implicit_all_blocked'
  | 'conflicting_conditions' | 'search_incomplete' | 'load_failed'
  | 'remote_version_unverified' | 'decision_conflict' | 'invalid_support_record';

export interface ContextIssue {
  readonly code: ContextIssueCode;
  readonly thinkId: string;
  readonly message: string;
}

export interface ContextSource {
  readonly thinkId: string;
  readonly title: string;
  readonly contentType: string;
  /** Complete Think text, including its title line. Hash uses these exact UTF-8 bytes. */
  readonly content: string;
  readonly contentHash: string;
  readonly hashAlgorithm: 'SHA-256';
  readonly normalizationVersion: 'exact-utf8-v1';
  /** Metadata timestamp observed when this request began; not a remote transaction version. */
  readonly observedUpdatedAt: string;
  readonly origin: 'loaded-memory' | 'storage-body';
  readonly hasUnsavedChanges: boolean;
}

export type ContextField = 'goal' | 'stage' | 'current' | 'provisionalConclusion'
  | 'decisions' | 'openQuestions' | 'nextAction' | 'completionCriteria' | 'legacyProposals';

export interface ContextStatement {
  readonly value: string;
  readonly sourceThinkId: string;
  readonly sourceContentHash: string;
  readonly legacyField: string;
  readonly recordVersion: number | null;
  readonly recordUpdatedAt: string;
  /** A legacy confirmation is record-wide evidence, not proof for this individual field. */
  readonly legacyConfirmation: { readonly at: string; readonly quote: string } | null;
  readonly authority: 'legacy-record' | 'legacy-ai-proposal';
}

export interface ContextSnapshot {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly vaultId: string;
  readonly bundleId: string;
  readonly startedAt: string;
  readonly capturedAt: string;
  readonly scope: 'bundle-only';
  readonly consistency: 'captured-client-state';
  readonly quality: 'complete' | 'partial';
  readonly bundle: ContextSource;
  readonly bundleDefinitions: readonly ContextSource[];
  readonly resolvedThinkIds: readonly string[];
  readonly sources: readonly ContextSource[];
  readonly state: Readonly<Record<ContextField, readonly ContextStatement[]>>;
  readonly manualState: Readonly<ThinkSupportRecord> | null;
  readonly subtasks?: SubtaskContext;
  readonly bundleProgress?: ProgressContext;
  readonly issues: readonly ContextIssue[];
}
