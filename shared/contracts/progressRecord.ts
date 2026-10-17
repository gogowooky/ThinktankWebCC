import { canonicalJson, id, object, text, readConversationLog } from './conversationRecord.js';
import { readThinkSupport } from './thinkSupportRecord.js';

export const MILESTONES = ['consideration', 'decision', 'execution', 'verification'] as const;
export const MILESTONE_LABELS = { consideration: '検討', decision: '意思決定', execution: '実行', verification: '検証' };
export const REACH_LABELS = { unrecorded: '未記録', achieved: '到達', reconsider: '再検討', unnecessary: '対象外' };
export type Reach = keyof typeof REACH_LABELS;
export interface ProgressInput {
  milestones: Record<typeof MILESTONES[number], Reach>;
  paused: boolean; evidence: string; remaining: string; resumeSummary: string; resumeCondition: string; reviewAt: string;
  sources: Array<{ thinkId: string; contentHash: string }>;
}
export interface ProgressEvent { id: string; revision: number; confirmedAt: string; author: 'human'; input: ProgressInput }
export interface ProgressLog { schemaVersion: 1; events: ProgressEvent[] }
export function emptyProgress(): ProgressInput {
  return { milestones: { consideration: 'unrecorded', decision: 'unrecorded', execution: 'unrecorded', verification: 'unrecorded' },
    paused: false, evidence: '', remaining: '', resumeSummary: '', resumeCondition: '', reviewAt: '', sources: [] };
}
export function validateProgress(value: unknown): asserts value is ProgressInput {
  if (!object(value) || !object(value.milestones) || Object.keys(value.milestones).length !== 4
    || !MILESTONES.every(k => typeof (value.milestones as Record<string, unknown>)[k] === 'string' && Object.prototype.hasOwnProperty.call(REACH_LABELS, (value.milestones as Record<string, unknown>)[k] as string))
    || typeof value.paused !== 'boolean' || !text(value.evidence, 4000) || !text(value.remaining, 4000)
    || !text(value.resumeSummary, 4000, true) || !text(value.resumeCondition, 4000, !value.paused)
    || typeof value.reviewAt !== 'string' || !Array.isArray(value.sources) || value.sources.length > 20) throw new Error('到達状態・根拠・残課題を確認してください。保留には再開条件が必要です。');
  if (value.reviewAt && (!/^\d{4}-\d{2}-\d{2}$/.test(value.reviewAt) || !Number.isFinite(Date.parse(value.reviewAt))
    || new Date(value.reviewAt).toISOString().slice(0, 10) !== value.reviewAt)) throw new Error('再確認日が不正です。');
  for (const s of value.sources) if (!object(s) || !id(s.thinkId) || typeof s.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(s.contentHash)) throw new Error('根拠資料の形式が不正です。');
  if (new Set(value.sources.map(s => s.thinkId)).size !== value.sources.length) throw new Error('根拠資料が重複しています。');
}
export function readProgress(value: unknown): ProgressLog {
  if (value == null) return { schemaVersion: 1, events: [] };
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.events) || value.events.length > 100) throw new Error('未対応の到達状態です。既存記録は保持します。');
  for (const [index, event] of value.events.entries()) {
    if (!object(event) || !id(event.id) || event.revision !== index + 1 || event.author !== 'human'
      || !text(event.confirmedAt, 40) || !Number.isFinite(Date.parse(event.confirmedAt))) throw new Error('到達状態の履歴が不正です。');
    validateProgress(event.input);
  }
  if (new Set(value.events.map(e => e.id)).size !== value.events.length) throw new Error('到達状態の操作IDが重複しています。');
  return value as unknown as ProgressLog;
}
export function sameProgress(a: ProgressInput, b: ProgressInput) { return canonicalJson(a) === canonicalJson(b); }
export interface ProgressReview { goal: string; nextAction: string; completionCriteria: string; notes: string[] }
/** These are observable gaps and exact repetitions, not judgments about the user's intentions. */
export function progressReview(metadata: Record<string, unknown>, bundleId: string): ProgressReview {
  const review: ProgressReview = { goal: '', nextAction: '', completionCriteria: '', notes: [] };
  try {
    const manual = readThinkSupport(metadata.thinkSupport);
    review.goal = manual?.values.goal ?? ''; review.nextAction = manual?.values.nextAction ?? ''; review.completionCriteria = manual?.values.completionCriteria ?? '';
    if (!review.goal.trim()) review.notes.push('目的が未記録です。今回何を決めたいか、課題の概要に記録してみてください。');
    if (!review.nextAction.trim()) review.notes.push('次の行動が未記録です。続ける一手、保留、終結のどれにするか確認してください。');
    if (!review.completionCriteria.trim()) review.notes.push('完了条件が未記録です。何を確認できれば終えられるか整理してください。');
    else review.notes.push('完了条件と実際の結果を照合し、到達した範囲と残課題を確認してください。');
  } catch { review.notes.push('課題の概要の保存形式を読めないため、内容に基づく提案を停止しました。'); }
  try {
    const turns = readConversationLog(metadata.thinkConversations).turns.filter(t => t.context.bundleId === bundleId).slice(-3);
    if (turns.length === 3 && new Set(turns.map(t => t.question.trim())).size === 1) review.notes.push('直近3回は同じ質問です。追加で必要な資料や、別の確かめ方を検討してみてください。');
    if (turns.length === 3 && turns.every(t => t.answer.insufficientEvidence)) review.notes.push('直近3回の回答に根拠不足があります。資料の追加や、再開条件を決めた保留を検討してください。');
  } catch { review.notes.push('会話履歴の形式を読めないため、繰り返しの確認は行っていません。'); }
  return review;
}
