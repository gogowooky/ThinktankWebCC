import { id, object, text, validateContext, validateTurn, type ConversationContext, type ConversationAnswer } from './conversationRecord.js';
export const AGENT_KINDS = { summary: '資料の要約', comparison: '資料の比較' } as const;
export type AgentKind = keyof typeof AGENT_KINDS;
export const AGENT_STATUS = { queued: '待機中', running: '実行中', succeeded: '成果物候補あり', failed: '失敗', cancelled: '中断' } as const;
export interface AgentAttempt { id: string; startedAt: string; finishedAt: string | null; outcome: 'running' | 'succeeded' | 'failed' | 'cancelled'; error: string }
export interface AgentJob {
  schemaVersion: 1; id: string; kind: AgentKind; instruction: string; context: ConversationContext;
  createdAt: string; updatedAt: string; status: keyof typeof AGENT_STATUS; attempts: AgentAttempt[];
  leaseUntil: string | null; result: ConversationAnswer | null; provider: string; model: string;
  applied: { thinkId: string; confirmedAt: string; contentHash: string } | null;
}
export interface AgentLog { schemaVersion: 1; jobs: AgentJob[] }
export function agentQuestion(job: Pick<AgentJob, 'kind' | 'instruction'>): string {
  const task = job.kind === 'summary' ? '資料をMarkdownで要約し、確認できることと未確認事項を分けてください。' : '資料を比較するMarkdown表を作り、比較軸、各資料の記述、相違点と不足情報を整理してください。';
  return `${task}回答本文を成果物候補として提示してください。資料の引用を付け、資料のない欄は未確認としてください。本人の決定や到達状態は変更しません。proposalsは空配列にしてください。\n追加の依頼：${job.instruction || 'なし'}`;
}
function date(value: unknown): value is string { return text(value, 40) && Number.isFinite(Date.parse(value)); }
export function readAgentLog(value: unknown, bundleId: string): AgentLog {
  if (value == null) return { schemaVersion: 1, jobs: [] };
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.jobs) || value.jobs.length > 20) throw new Error('未対応のAgent記録です。既存データを保持します。');
  for (const job of value.jobs) {
    if (!object(job) || job.schemaVersion !== 1 || !id(job.id) || typeof job.kind !== 'string' || !['summary', 'comparison'].includes(job.kind)
      || !text(job.instruction, 2000, true) || !date(job.createdAt) || !date(job.updatedAt)
      || typeof job.status !== 'string' || !Object.keys(AGENT_STATUS).includes(job.status) || !Array.isArray(job.attempts) || job.attempts.length > 5
      || typeof job.provider !== 'string' || typeof job.model !== 'string') throw new Error('Agent記録の形式が不正です。');
    validateContext(job.context);
    if (job.context.bundleId !== bundleId) throw new Error('Agentの対象Bundleが一致しません。');
    for (const attempt of job.attempts) if (!object(attempt) || !id(attempt.id) || !date(attempt.startedAt)
      || !(attempt.finishedAt === null || date(attempt.finishedAt)) || typeof attempt.outcome !== 'string' || !['running', 'succeeded', 'failed', 'cancelled'].includes(attempt.outcome)
      || !text(attempt.error, 2000, true)) throw new Error('実行履歴が不正です。');
    if (!(job.leaseUntil === null || date(job.leaseUntil))) throw new Error('実行期限が不正です。');
    if (job.status === 'running' && (!job.leaseUntil || job.attempts[job.attempts.length - 1]?.outcome !== 'running')) throw new Error('実行状態が不正です。');
    if (job.result !== null) validateTurn({ schemaVersion: 1, id: job.id, createdAt: job.updatedAt, question: agentQuestion(job as unknown as AgentJob),
      context: job.context, answer: job.result, provider: job.provider, model: job.model });
    if ((job.status === 'succeeded') !== (job.result !== null)) throw new Error('成果物と実行状態が一致しません。');
    if (job.applied !== null && (!object(job.applied) || !id(job.applied.thinkId) || !date(job.applied.confirmedAt)
      || typeof job.applied.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(job.applied.contentHash) || job.status !== 'succeeded')) throw new Error('成果物の適用記録が不正です。');
  }
  if (new Set(value.jobs.map(j => j.id)).size !== value.jobs.length) throw new Error('ジョブIDが重複しています。');
  return value as unknown as AgentLog;
}
export function artifactFor(job: AgentJob): { thinkId: string; title: string; body: string } {
  if (!job.result) throw new Error('成果物候補がありません。');
  const title = `${AGENT_KINDS[job.kind]} ${job.context.bundleId}`;
  const thinkId = `${job.createdAt.slice(0, 10)}-${job.createdAt.slice(11, 19).replace(/:/g, '')}-agent-${job.id}`;
  const citations = job.result.citations.map((c, i) => `### 出典 ${i + 1}: ${c.thinkId}\n\n${c.quote.split('\n').map(line => `> ${line}`).join('\n')}\n\n本文ハッシュ: ${c.contentHash}`).join('\n\n');
  const body = `AIによる成果物候補。本人の判断・課題完了を確定するものではありません。\n\n${job.result.insufficientEvidence ? '根拠不足・未確認事項を含みます。\n\n' : ''}${job.result.reply}\n\n## 出典（生成時点）\n\n${citations || '引用なし'}\n\nSnapshot: ${job.context.snapshotId}\n生成: ${job.provider} / ${job.model}`;
  return { thinkId, title, body };
}
