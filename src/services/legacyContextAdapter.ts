import type { ContextField, ContextIssue, ContextSource, ContextStatement } from './contextTypes';

const fields = {
  goal: 'goal', current: 'current', decisions: 'decisions', openQuestions: 'undecided',
  nextAction: 'next', completionCriteria: 'completion', legacyProposals: 'proposals',
} as const;

export function emptyContextState(): Record<ContextField, ContextStatement[]> {
  return { goal: [], stage: [], current: [], provisionalConclusion: [], decisions: [],
    openQuestions: [], nextAction: [], completionCriteria: [], legacyProposals: [] };
}

/** Read legacy metadata without inferring a stage, conclusion, or field-level confirmation. */
export function appendLegacyContext(
  state: Record<ContextField, ContextStatement[]>, source: ContextSource,
  metadata: Record<string, unknown>, issues: ContextIssue[],
): void {
  const raw = metadata.thoughtSupport;
  if (raw === undefined) return;
  const invalid = () => issues.push({ code: 'invalid_support_record', thinkId: source.thinkId, message: '旧思考支援メタデータに不正な値があります。' });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { invalid(); return; }
  const record = raw as Record<string, unknown>;
  const confirmation = typeof record.confirmedAt === 'string' && record.confirmedAt
    && typeof record.confirmationQuote === 'string' && record.confirmationQuote
    ? { at: record.confirmedAt, quote: record.confirmationQuote } : null;
  for (const [field, legacyField] of Object.entries(fields)) {
    const value = record[legacyField];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string') { invalid(); continue; }
    if (!value.trim()) continue;
    state[field as ContextField].push({
      value, sourceThinkId: source.thinkId, sourceContentHash: source.contentHash, legacyField,
      recordVersion: typeof record.version === 'number' && Number.isInteger(record.version) && record.version >= 0 ? record.version : null,
      recordUpdatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
      legacyConfirmation: confirmation,
      authority: field === 'legacyProposals' ? 'legacy-ai-proposal' : 'legacy-record',
    });
  }
}
