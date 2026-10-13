import { id, object, text } from './conversationRecord.js';

export interface SubtaskCandidate { id: string; title: string; goal: string; completionCriteria: string; reason: string }
export interface PauseCandidate { paused: boolean; userQuote: string; reason: string; resumeCondition: string; resumeSummary: string }

export function validateSubtaskCandidates(value: unknown, scope: string): asserts value is SubtaskCandidate[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 5 || (scope !== 'bundle-only' && value.length)) throw new Error('サブ課題候補の形式が不正です。');
  const seen = new Set<string>();
  for (const p of value) {
    if (!object(p) || !id(p.id) || seen.has(p.id) || !text(p.title, 200) || /[\r\n]/.test(p.title)
      || !text(p.goal, 4000) || !text(p.completionCriteria, 4000, true) || !text(p.reason, 2000)) throw new Error('サブ課題候補の内容・IDを確認してください。');
    seen.add(p.id);
  }
}
export function validatePauseCandidates(value: unknown, question: string, scope: string): asserts value is PauseCandidate[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 1 || (scope !== 'bundle-only' && value.length)) throw new Error('保留・再開候補の形式が不正です。');
  for (const p of value) {
    if (!object(p) || typeof p.paused !== 'boolean' || !text(p.userQuote, 2000) || !question.includes(p.userQuote)
      || !text(p.reason, 2000) || !text(p.resumeCondition, 4000, true) || !text(p.resumeSummary, 4000, true)) throw new Error('保留・再開候補の根拠が本人の発言と一致しません。');
  }
}

export const subtaskCandidatesSchema = { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['id', 'title', 'goal', 'completionCriteria', 'reason'], properties: {
    id: { type: 'string' }, title: { type: 'string' }, goal: { type: 'string' }, completionCriteria: { type: 'string' }, reason: { type: 'string' },
  } } };
export const pauseCandidatesSchema = { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['paused', 'userQuote', 'reason', 'resumeCondition', 'resumeSummary'], properties: {
    paused: { type: 'boolean' }, userQuote: { type: 'string' }, reason: { type: 'string' }, resumeCondition: { type: 'string' }, resumeSummary: { type: 'string' },
  } } };
