/**
 * shared/mcp/toolArgs.ts
 * MCP ツールの引数の検証と読み取り（件数の上限、作成できる種別、昇格候補・projectId の解釈）。
 * 外からは shared/mcpProtocol.ts を通して使う。
 */

import { isSafeThinkId } from '../vaultFormat';
import type { PromotionTargetType } from '../domainProfile';
import type { CitationRef } from '../operations';
import type { McpAddPromotionCandidateParams } from './types';
import type { McpErrorCode } from './toolErrors';

const VALID_PROMOTION_TYPES: ReadonlySet<PromotionTargetType> = new Set([
  'decision',
  'evidence',
  'risk',
  'assumption',
  'action',
  'gate_result',
  'learning',
]);

export type CreateCategory = 'memo' | 'aiview' | 'task' | 'links' | 'table';

export const VALID_CREATE_CATEGORIES: ReadonlySet<CreateCategory> = new Set([
  'memo',
  'aiview',
  'task',
  'links',
  'table',
]);

export function clampLimit(raw: unknown, defaultLimit = 50, maxLimit = 200): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return defaultLimit;
  return Math.min(Math.floor(num), maxLimit);
}

export const MAX_BATCH_CANDIDATES = 20;

export function resolveProjectIdArg(args: Record<string, unknown>): string | undefined {
  const raw = typeof args.projectId === 'string' && args.projectId.trim()
    ? args.projectId.trim()
    : typeof args.bundleId === 'string' && args.bundleId.trim()
      ? args.bundleId.trim()
      : undefined;
  return raw;
}

/** projectId と projectIds をまとめ、重複を除いた順序付きリストにする。不正IDがあればそれを返す。 */
export function resolveProjectIdsArg(
  args: Record<string, unknown>,
): { ids: string[]; invalid?: string } {
  const ids: string[] = [];
  const push = (raw: unknown): string | undefined => {
    if (typeof raw !== 'string') return undefined;
    const v = raw.trim();
    if (!v) return undefined;
    if (!isSafeThinkId(v)) return v;
    if (!ids.includes(v)) ids.push(v);
    return undefined;
  };
  const single = resolveProjectIdArg(args);
  if (single !== undefined) {
    const bad = push(single);
    if (bad) return { ids, invalid: bad };
  }
  if (Array.isArray(args.projectIds)) {
    for (const item of args.projectIds) {
      const bad = push(item);
      if (bad) return { ids, invalid: bad };
    }
  }
  return { ids };
}

export type ParsedCandidate = Omit<McpAddPromotionCandidateParams, 'projectId'>;

function parseCitations(raw: unknown): CitationRef[] {
  const citations: CitationRef[] = [];
  if (!Array.isArray(raw)) return citations;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const sourceThinkid = typeof c.sourceThinkid === 'string' ? c.sourceThinkid.trim() : '';
    if (!sourceThinkid) continue;
    citations.push({
      sourceThinkid,
      sourceTitle: typeof c.sourceTitle === 'string' ? c.sourceTitle.trim() : undefined,
      snippet: typeof c.snippet === 'string' ? c.snippet.trim() : undefined,
    });
  }
  return citations;
}

/** 昇格候補1件分の引数を検証する。単体ツールと一括ツールで同じ規則を使う。 */
export function parseCandidateInput(
  raw: Record<string, unknown>,
):
  | { status: 'ok'; value: ParsedCandidate }
  | { status: 'error'; error: { code: McpErrorCode; message: string } } {
  const rawType = typeof raw.type === 'string' ? raw.type.trim() : '';
  if (!VALID_PROMOTION_TYPES.has(rawType as PromotionTargetType)) {
    return { status: 'error', error: { code: 'INVALID_ARGUMENT', message: `不正な昇格候補 type です: ${rawType}` } };
  }
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  if (!title || !summary) {
    return { status: 'error', error: { code: 'INVALID_ARGUMENT', message: '昇格候補の登録には title と summary が必須です。' } };
  }
  const optional = (key: string): string | undefined =>
    typeof raw[key] === 'string' ? (raw[key] as string).trim() : undefined;
  return {
    status: 'ok',
    value: {
      type: rawType as PromotionTargetType,
      title,
      summary,
      rationale: optional('rationale'),
      impactScope: optional('impactScope'),
      proposedOwner: optional('proposedOwner'),
      dueDate: optional('dueDate'),
      citations: parseCitations(raw.citations),
    },
  };
}
