import { THINK_FIELDS, readThinkSupport, type ThinkSupportRecord, type ThinkField } from './thinkSupportRecord.js';
import { conversationPresentation } from './conversationPresentation.js';
import { validateSubtaskContext, validateProgressContext, type SubtaskContext, type ProgressContext } from './subtaskContext.js';
import { validatePauseCandidates, validateSubtaskCandidates, type PauseCandidate, type SubtaskCandidate } from './lifecycleProposals.js';

export interface ConversationSource { thinkId: string; title: string; content: string; contentHash: string; contentType?: string }
export interface ConversationContext {
  schemaVersion: 1; snapshotId: string; vaultId: string; bundleId: string; capturedAt: string;
  scope: 'bundle-only' | 'chat-only'; quality: 'complete' | 'partial';
  sources: ConversationSource[]; issues: string[]; manualState: ThinkSupportRecord | null;
  subtasks?: SubtaskContext;
  bundleProgress?: ProgressContext;
}
export interface Citation { thinkId: string; quote: string; contentHash: string; start: number; end: number }
export interface Proposal { field: ThinkField; before: string; after: string; reason: string }
export const PROGRESS_MILESTONES = ['consideration', 'decision', 'execution', 'verification'] as const;
export interface ProgressProposal { milestone: typeof PROGRESS_MILESTONES[number]; reach: 'achieved' | 'reconsider' | 'unnecessary'; userQuote: string; reason: string }
export interface ConversationAnswer { reply: string; insufficientEvidence: boolean; citations: Citation[]; proposals: Proposal[]; progressProposals?: ProgressProposal[]; subtaskCandidates?: SubtaskCandidate[]; pauseCandidates?: PauseCandidate[] }
export interface ConversationTurn {
  schemaVersion: 1; id: string; createdAt: string; question: string; context: ConversationContext;
  answer: ConversationAnswer; provider: string; model: string;
}
export interface ConversationLog { schemaVersion: 1; turns: ConversationTurn[] }
export const MAX_CONTEXT_CHARS = 120000;
export const MAX_LOG_BYTES = 2000000;
const TRANSCRIPT_START = '<!-- thinktank-ai-conversation:start -->';
const TRANSCRIPT_END = '<!-- thinktank-ai-conversation:end -->';

/** Keep the editable Chat text and the structured conversation log visibly consistent. */
export function mergeConversationTranscript(content: string, turns: ConversationTurn[]): string {
  const start = content.indexOf(TRANSCRIPT_START);
  const end = start >= 0 ? content.indexOf(TRANSCRIPT_END, start + TRANSCRIPT_START.length) : -1;
  const before = (start >= 0 ? content.slice(0, start) : content).trimEnd();
  const after = end >= 0 ? content.slice(end + TRANSCRIPT_END.length).trim() : '';
  if (!turns.length) return [before, after].filter(Boolean).join('\n\n');
  const transcript = turns.filter(turn => turn.provider !== 'legacy-text').map(turn => {
    const presentation = conversationPresentation(turn);
    const proposals = turn.answer.proposals.map(proposal =>
      `### AIの変更提案：${proposal.field}\n${proposal.after}\n\n理由：${proposal.reason}`);
    return [`## ${turn.question.replace(/[\r\n]+/g, ' ').trim()}`, presentation.reply,
      turn.answer.insufficientEvidence ? '根拠不足・未確認事項を含みます。' : '', ...proposals,
      ...(turn.answer.progressProposals ?? []).map(p => `### AIの到達状態候補（未確認）：${p.milestone}\n${p.reach}\n本人の発言：${p.userQuote}\n理由：${p.reason}`),
      ...(turn.answer.subtaskCandidates ?? []).map(p => `### AIのサブ課題候補（未採用）：${p.title}\n目的：${p.goal}\n完了条件：${p.completionCriteria || '未整理'}\n理由：${p.reason}`),
      ...(turn.answer.pauseCandidates ?? []).map(p => `### AIの${p.paused ? '保留' : '再開'}候補（未確認）\n本人の発言：${p.userQuote}\n理由：${p.reason}\n再開条件：${p.resumeCondition || '未整理'}\n再開メモ：${p.resumeSummary}`)]
      .filter(Boolean).join('\n\n');
  }).join('\n\n');
  if (!transcript) return [before, after].filter(Boolean).join('\n\n');
  return [before, `${TRANSCRIPT_START}\n${transcript}\n${TRANSCRIPT_END}`, after].filter(Boolean).join('\n\n');
}

/** Recover conversations created by the former text-only Chat implementation. */
export function legacyConversationTurns(content: string, vaultId: string, chatId: string, capturedAt: string): ConversationTurn[] {
  if (!id(vaultId) || !id(chatId)) return [];
  const managedAt = content.indexOf(TRANSCRIPT_START);
  const legacy = managedAt >= 0 ? content.slice(0, managedAt) : content;
  const lines = legacy.split(/\r?\n/);
  const turns: ConversationTurn[] = [];
  for (let index = 0; index < lines.length && turns.length < 100; index += 1) {
    if (!lines[index].startsWith('## ')) continue;
    const question = lines[index].slice(3).trim();
    const answer: string[] = [];
    while (++index < lines.length && !lines[index].startsWith('## ')) answer.push(lines[index]);
    index -= 1;
    const reply = answer.join('\n').trim();
    if (!question || !reply) continue;
    const ordinal = turns.length;
    turns.push({ schemaVersion: 1, id: `legacy-${ordinal}`, createdAt: new Date(Date.parse(capturedAt) + ordinal).toISOString(), question,
      context: { schemaVersion: 1, snapshotId: chatId, vaultId, bundleId: chatId, capturedAt, scope: 'chat-only', quality: 'complete', sources: [], issues: [], manualState: null },
      answer: { reply, insufficientEvidence: false, citations: [], proposals: [] }, provider: 'legacy-text', model: 'stored-chat-text' });
  }
  return turns;
}
// BigQuery JSON columns may reorder keys; equality must not depend on serialization order.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function text(value: unknown, max: number, empty = false): value is string {
  return typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0);
}
export function id(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value); }
function date(value: unknown): value is string { return text(value, 40) && Number.isFinite(Date.parse(value)); }
export function validateContext(value: unknown): asserts value is ConversationContext {
  if (!object(value) || value.schemaVersion !== 1 || !id(value.snapshotId) || !id(value.vaultId) || !id(value.bundleId)
    || !date(value.capturedAt) || !['bundle-only', 'chat-only'].includes(String(value.scope)) || !['complete', 'partial'].includes(String(value.quality))
    || !Array.isArray(value.sources) || value.sources.length > 300 || !Array.isArray(value.issues)
    || value.issues.length > 1000 || !value.issues.every(i => text(i, 1000))) throw new Error('参照資料の形式が不正です。');
  if (value.scope === 'chat-only' && (value.sources.length || value.manualState !== null || value.bundleId !== value.snapshotId)) throw new Error('Chat単独対話の参照形式が不正です。');
  if (value.subtasks !== undefined) {
    if (value.scope !== 'bundle-only') throw new Error('Chat単独対話には子課題を含められません。');
    validateSubtaskContext(value.subtasks, value.bundleId);
  }
  if (value.bundleProgress !== undefined) {
    if (value.scope !== 'bundle-only') throw new Error('Chat単独対話には到達状態を含められません。');
    validateProgressContext(value.bundleProgress);
  }
  let length = 0;
  const ids = new Set<string>();
  for (const s of value.sources) {
    if (!object(s) || !id(s.thinkId) || ids.has(s.thinkId) || !text(s.title, 2000, true)
      || !text(s.content, MAX_CONTEXT_CHARS, true) || typeof s.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(s.contentHash)) throw new Error('資料または本文ハッシュが不正です。');
    ids.add(s.thinkId); length += s.content.length;
    if (s.contentType !== undefined && !['memo', 'links', 'chat', 'bundle', 'table', 'html', 'nettext'].includes(String(s.contentType))) throw new Error('資料の種別が不正です。');
  }
  if (length > MAX_CONTEXT_CHARS) throw new Error('資料が大きすぎます。Bundleを分けてください。');
  if (value.manualState !== null) {
    if (!object(value.manualState)) throw new Error('手動記録の形式が不正です。');
    readThinkSupport(value.manualState);
  }
}
export function validateTurn(value: unknown): asserts value is ConversationTurn {
  if (!object(value) || value.schemaVersion !== 1 || !id(value.id) || !date(value.createdAt) || !text(value.question, 4000)
    || !text(value.provider, 100) || !text(value.model, 200)) throw new Error('会話の形式が不正です。');
  validateContext(value.context);
  const a = value.answer;
  if (!object(a) || !text(a.reply, 20000) || typeof a.insufficientEvidence !== 'boolean' || !Array.isArray(a.citations)
    || a.citations.length > 30 || !Array.isArray(a.proposals) || a.proposals.length > 7) throw new Error('応答の形式が不正です。');
  for (const c of a.citations) {
    if (!object(c)) throw new Error('引用が不正です。');
    const source = value.context.sources.find(s => s.thinkId === c.thinkId);
    if (!source || !text(c.quote, 2000) || c.contentHash !== source.contentHash || !Number.isInteger(c.start) || !Number.isInteger(c.end)
      || (c.start as number) < 0 || c.end !== (c.start as number) + c.quote.length
      || source.content.slice(c.start as number, c.end as number) !== c.quote) throw new Error('引用が資料本文と一致しません。');
  }
  const fields = new Set<string>();
  validateProgressProposals(a.progressProposals, value.question, value.context.scope);
  validateSubtaskCandidates(a.subtaskCandidates, value.context.scope);
  validatePauseCandidates(a.pauseCandidates, value.question, value.context.scope);
  for (const p of a.proposals) {
    if (!object(p) || !THINK_FIELDS.includes(p.field as ThinkField) || fields.has(String(p.field))
      || !text(p.before, 10000, true) || !text(p.after, 10000) || !text(p.reason, 2000)
      || p.before !== (value.context.manualState?.values[p.field as ThinkField] ?? '')) throw new Error('変更提案の基準が不正です。');
    fields.add(String(p.field));
  }
}
export function validateProgressProposals(value: unknown, question: string, scope: ConversationContext['scope']): asserts value is ProgressProposal[] | undefined {
  if (value === undefined) return; // Existing conversation records remain readable.
  if (!Array.isArray(value) || value.length > 4 || (scope !== 'bundle-only' && value.length)) throw new Error('到達状態候補の形式が不正です。');
  const seen = new Set<string>();
  for (const p of value) {
    if (!object(p) || !PROGRESS_MILESTONES.includes(p.milestone as ProgressProposal['milestone']) || seen.has(String(p.milestone))
      || typeof p.reach !== 'string' || !['achieved', 'reconsider', 'unnecessary'].includes(p.reach) || !text(p.reason, 2000)
      || !text(p.userQuote, 2000) || !question.includes(p.userQuote)) throw new Error('到達状態候補の根拠が本人の発言と一致しません。');
    seen.add(String(p.milestone));
  }
}
export function readConversationLog(value: unknown): ConversationLog {
  if (value == null) return { schemaVersion: 1, turns: [] };
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.turns) || value.turns.length > 100) throw new Error('未対応の会話履歴です。既存記録を保持します。');
  value.turns.forEach(validateTurn);
  if (new Set(value.turns.map(t => t.id)).size !== value.turns.length) throw new Error('会話IDが重複しています。');
  return value as unknown as ConversationLog;
}
