/**
 * shared/responseValidator.ts
 * AI CLI の標準出力から JSON 応答を抽出・検査・正規化する純粋ロジック。
 */

import type { PromotionTargetType } from './domainProfile';
import type { CitationRef } from './operations';

export interface ValidatedStateProposal {
  field: string;
  proposedValue: string;
  reason: string;
}

export interface ValidatedSubtaskCandidate {
  title: string;
  reason: string;
}

export interface ValidatedPauseCandidate {
  reason: string;
  resumeCondition: string;
}

export interface ValidatedPromotionCandidate {
  type: PromotionTargetType;
  title: string;
  summary: string;
  rationale?: string;
  impactScope?: string;
  proposedOwner?: string;
  dueDate?: string;
  citations: CitationRef[];
}

export interface ValidatedAiResponse {
  reply: string;
  insufficientEvidence: boolean;
  citations: CitationRef[];
  proposals: ValidatedStateProposal[];
  subtaskCandidates: ValidatedSubtaskCandidate[];
  pauseCandidates: ValidatedPauseCandidate[];
  promotionCandidates: ValidatedPromotionCandidate[];
  rawText: string;
  parsedAsJson: boolean;
}

const VALID_PROMOTION_TYPES: readonly PromotionTargetType[] = [
  'decision',
  'evidence',
  'risk',
  'assumption',
  'action',
  'gate_result',
  'learning',
];

function isPromotionTargetType(val: unknown): val is PromotionTargetType {
  return typeof val === 'string' && (VALID_PROMOTION_TYPES as readonly string[]).includes(val);
}

function normalizeCitations(raw: unknown): CitationRef[] {
  if (!Array.isArray(raw)) return [];
  const result: CitationRef[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const sourceThinkid =
      typeof obj.sourceThinkid === 'string'
        ? obj.sourceThinkid.trim()
        : typeof obj.thinkid === 'string'
          ? obj.thinkid.trim()
          : '';
    if (!sourceThinkid) continue;
    result.push({
      sourceThinkid,
      sourceTitle: typeof obj.sourceTitle === 'string' ? obj.sourceTitle : undefined,
      sourceVersionToken:
        typeof obj.sourceVersionToken === 'string' ? obj.sourceVersionToken : undefined,
      snippet: typeof obj.snippet === 'string' ? obj.snippet : undefined,
    });
  }
  return result;
}

/**
 * 文字列内から JSON オブジェクト候補を取り出す。
 */
export function extractJsonFromCliOutput(rawOutput: string): Record<string, unknown> | null {
  const trimmed = rawOutput.trim();
  if (!trimmed) return null;

  // 1. ```json ... ``` ブロックを探す
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed: unknown = JSON.parse(codeBlockMatch[1].trim());
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 次の手法へフォールバック
    }
  }

  // 2. 全体が JSON か試す
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // 次の手法へフォールバック
  }

  // 3. 最初の '{' から最後の '}' までを切り出して試す
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed: unknown = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * AI CLI の出力を検証・正規化して返す。
 * JSON パースに失敗した場合でもプレーンテキスト応答として安全にラップする。
 */
export function validateAiCliResponse(rawOutput: string): ValidatedAiResponse {
  const obj = extractJsonFromCliOutput(rawOutput);
  if (!obj) {
    return {
      reply: rawOutput.trim() || '（応答が空でした）',
      insufficientEvidence: false,
      citations: [],
      proposals: [],
      subtaskCandidates: [],
      pauseCandidates: [],
      promotionCandidates: [],
      rawText: rawOutput,
      parsedAsJson: false,
    };
  }

  const reply =
    typeof obj.reply === 'string' && obj.reply.trim()
      ? obj.reply.trim()
      : typeof obj.message === 'string' && obj.message.trim()
        ? obj.message.trim()
        : rawOutput.trim();

  const insufficientEvidence = obj.insufficientEvidence === true;
  const citations = normalizeCitations(obj.citations);

  const proposals: ValidatedStateProposal[] = [];
  if (Array.isArray(obj.proposals)) {
    for (const p of obj.proposals) {
      if (typeof p === 'object' && p !== null) {
        const rec = p as Record<string, unknown>;
        if (typeof rec.field === 'string' && typeof rec.proposedValue === 'string') {
          proposals.push({
            field: rec.field,
            proposedValue: rec.proposedValue,
            reason: typeof rec.reason === 'string' ? rec.reason : '',
          });
        }
      }
    }
  }

  const subtaskCandidates: ValidatedSubtaskCandidate[] = [];
  if (Array.isArray(obj.subtaskCandidates)) {
    for (const st of obj.subtaskCandidates) {
      if (typeof st === 'object' && st !== null) {
        const rec = st as Record<string, unknown>;
        if (typeof rec.title === 'string' && rec.title.trim()) {
          subtaskCandidates.push({
            title: rec.title.trim(),
            reason: typeof rec.reason === 'string' ? rec.reason : '',
          });
        }
      }
    }
  }

  const pauseCandidates: ValidatedPauseCandidate[] = [];
  if (Array.isArray(obj.pauseCandidates)) {
    for (const pc of obj.pauseCandidates) {
      if (typeof pc === 'object' && pc !== null) {
        const rec = pc as Record<string, unknown>;
        if (typeof rec.reason === 'string' && rec.reason.trim()) {
          pauseCandidates.push({
            reason: rec.reason.trim(),
            resumeCondition: typeof rec.resumeCondition === 'string' ? rec.resumeCondition : '',
          });
        }
      }
    }
  }

  const promotionCandidates: ValidatedPromotionCandidate[] = [];
  if (Array.isArray(obj.promotionCandidates)) {
    for (const pm of obj.promotionCandidates) {
      if (typeof pm === 'object' && pm !== null) {
        const rec = pm as Record<string, unknown>;
        const type = isPromotionTargetType(rec.type) ? rec.type : 'evidence';
        const title = typeof rec.title === 'string' ? rec.title.trim() : '';
        const summary = typeof rec.summary === 'string' ? rec.summary.trim() : '';
        if (!title && !summary) continue;
        promotionCandidates.push({
          type,
          title: title || summary.slice(0, 40),
          summary: summary || title,
          rationale: typeof rec.rationale === 'string' ? rec.rationale : undefined,
          impactScope: typeof rec.impactScope === 'string' ? rec.impactScope : undefined,
          proposedOwner: typeof rec.proposedOwner === 'string' ? rec.proposedOwner : undefined,
          dueDate: typeof rec.dueDate === 'string' ? rec.dueDate : undefined,
          citations: normalizeCitations(rec.citations),
        });
      }
    }
  }

  return {
    reply,
    insufficientEvidence,
    citations,
    proposals,
    subtaskCandidates,
    pauseCandidates,
    promotionCandidates,
    rawText: rawOutput,
    parsedAsJson: true,
  };
}
