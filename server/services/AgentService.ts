import { createHash, randomUUID } from 'node:crypto';
import type { BigQueryService } from './BigQueryService.js';
import type { AIProvider } from './AIProvider.js';
import { ConversationService, verifyContextHashes } from './ConversationService.js';
import { canonicalJson, id, object, text, validateContext, type ConversationContext } from './conversationRecord.js';
import { agentQuestion, artifactFor, readAgentLog, type AgentKind, type AgentJob, type AgentLog } from './agentRecord.js';

export class AgentError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export type AgentStore = Pick<BigQueryService, 'getRecord' | 'saveThinkSupport' | 'applyAgentArtifact'>;
export class AgentService {
  private readonly active = new Map<string, AbortController>();
  constructor(private readonly provider: AIProvider, private readonly store: AgentStore) {}
  status() { return { enabled: this.provider.name !== 'none', provider: this.provider.name, model: this.provider.model, scope: 'bundle-only' }; }
  async read(bundleId: string) {
    if (!id(bundleId)) throw new AgentError(400, 'Bundle IDが不正です。');
    const result = await this.store.getRecord(bundleId);
    if (!result.success) throw new AgentError(503, 'ジョブ保存先に接続できません。');
    const record = result.data;
    if (!record || record.category !== 'bundle' || record.is_deleted) throw new AgentError(404, '保存済みBundleがありません。');
    const metadata: unknown = typeof record.metadata === 'string' ? JSON.parse(record.metadata) : structuredClone(record.metadata ?? {});
    if (!object(metadata)) throw new AgentError(422, 'Bundleの保存形式が不正です。');
    const version = object(record.updated_at) && 'value' in record.updated_at ? String(record.updated_at.value) : String(record.updated_at);
    if (!Number.isFinite(Date.parse(version))) throw new AgentError(422, '保存版を確認できません。');
    return { metadata, version, log: readAgentLog(metadata.thinkAgentJobs, bundleId) };
  }
  private find(log: AgentLog, jobId: string) {
    const job = log.jobs.find(j => j.id === jobId);
    if (!job) throw new AgentError(404, 'ジョブがありません。');
    return job;
  }
  private async edit(bundleId: string, change: (log: AgentLog, now: string) => AgentJob): Promise<AgentJob> {
    for (let retry = 0; retry < 3; retry++) {
      const { metadata, version, log } = await this.read(bundleId);
      const now = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
      const job = change(log, now);
      readAgentLog(log, bundleId);
      if (Buffer.byteLength(JSON.stringify(log)) > 2000000) throw new AgentError(409, 'ジョブ履歴の容量上限です。別のBundleで実行してください。');
      const saved = await this.store.saveThinkSupport(bundleId, version, { ...metadata, thinkAgentJobs: log }, now);
      if (!saved.success) throw new AgentError(503, 'ジョブ保存を確認できません。状態を再取得してください。');
      if (saved.data) return job;
    }
    throw new AgentError(409, '別の更新と競合しています。状態を再取得してください。');
  }
  async create(jobId: string, kind: AgentKind, instruction: string, context: ConversationContext): Promise<AgentJob> {
    if (!id(jobId) || jobId.length > 80 || !['summary', 'comparison'].includes(kind) || !text(instruction, 2000, true)) throw new AgentError(400, 'ジョブの入力が不正です。');
    validateContext(context); verifyContextHashes(context);
    if (!context.sources.length) throw new AgentError(400, '参照資料がありません。資料を追加してください。');
    return this.edit(context.bundleId, (log, now) => {
      const existing = log.jobs.find(j => j.id === jobId);
      if (existing) {
        if (existing.kind !== kind || existing.instruction !== instruction || canonicalJson(existing.context) !== canonicalJson(context)) throw new AgentError(409, '同じジョブIDが別の依頼に使われています。');
        return existing;
      }
      if (log.jobs.length >= 20) throw new AgentError(409, 'ジョブは20件までです。履歴を保全して別のBundleで続けてください。');
      // Reserve space for the bounded response before charging for a model call.
      if (Buffer.byteLength(JSON.stringify(log)) + Buffer.byteLength(JSON.stringify(context)) > 1500000) throw new AgentError(409, '成果物を保存する空き容量がありません。別のBundleで続けてください。');
      const job: AgentJob = { schemaVersion: 1, id: jobId, kind, instruction, context, createdAt: now, updatedAt: now,
        status: 'queued', attempts: [], leaseUntil: null, result: null, provider: '', model: '', applied: null };
      log.jobs.push(job); return job;
    });
  }
  async run(bundleId: string, jobId: string, retry: boolean, signal?: AbortSignal): Promise<AgentJob> {
    if (this.provider.name === 'none') throw new AgentError(503, 'AI処理は停止中です。');
    const key = `${bundleId}/${jobId}`;
    if (this.active.has(key) || this.active.size >= 4) throw new AgentError(409, '処理が実行中です。状態を確認してください。');
    const abort = new AbortController(); this.active.set(key, abort);
    const disconnect = () => abort.abort();
    signal?.addEventListener('abort', disconnect, { once: true });
    if (signal?.aborted) abort.abort();
    const timer = setTimeout(() => abort.abort(), 120000);
    const runId = randomUUID();
    let claimed = false;
    try {
      abort.signal.throwIfAborted();
      const prior = this.find((await this.read(bundleId)).log, jobId);
      if (prior.status === 'succeeded') return prior;
      const job = await this.edit(bundleId, (log, now) => {
        const j = this.find(log, jobId);
        if (j.status === 'succeeded') throw new AgentError(409, '成果物は生成済みです。状態を再取得してください。');
        if (j.status === 'running' && Date.parse(j.leaseUntil!) > Date.now()) throw new AgentError(409, '実行中です。期限まで待つか中断してください。');
        if (j.status !== 'queued' && !retry) throw new AgentError(409, '再実行には、AIを再度呼び出す確認が必要です。');
        if (j.attempts.length >= 5) throw new AgentError(409, '再試行は合計5回までです。');
        const previous = j.attempts[j.attempts.length - 1];
        if (previous?.outcome === 'running') { previous.outcome = 'failed'; previous.finishedAt = now; previous.error = '実行期限切れ。前の処理結果は採用しません。'; }
        j.attempts.push({ id: runId, startedAt: now, finishedAt: null, outcome: 'running', error: '' });
        j.status = 'running'; j.updatedAt = now; j.leaseUntil = new Date(Date.now() + 180000).toISOString(); j.result = null;
        j.provider = this.provider.name; j.model = this.provider.model; return j;
      });
      claimed = true;
      const turn = await new ConversationService(this.provider).answer(job.id, agentQuestion(job), job.context, [], abort.signal);
      abort.signal.throwIfAborted();
      return await this.edit(bundleId, (log, now) => {
        const j = this.find(log, jobId); const attempt = j.attempts[j.attempts.length - 1];
        if (j.status !== 'running' || attempt?.id !== runId) return j;
        if (abort.signal.aborted) { j.status = 'cancelled'; attempt.outcome = 'cancelled'; }
        else { j.status = 'succeeded'; j.result = turn.answer; attempt.outcome = 'succeeded'; }
        j.leaseUntil = null; j.updatedAt = now; attempt.finishedAt = now; return j;
      });
    } catch (e) {
      if (!claimed) throw e;
      return await this.edit(bundleId, (log, now) => {
        const j = this.find(log, jobId); const attempt = j.attempts[j.attempts.length - 1];
        if (j.status !== 'running' || attempt?.id !== runId) return j;
        j.status = abort.signal.aborted ? 'cancelled' : 'failed'; j.leaseUntil = null; j.updatedAt = now;
        attempt.outcome = j.status; attempt.finishedAt = now;
        attempt.error = abort.signal.aborted ? '中断または実行時間の上限に達しました。' : '生成・引用検証・候補保存に失敗しました。元資料は変更していません。';
        return j;
      });
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', disconnect); this.active.delete(key); }
  }
  async cancel(bundleId: string, jobId: string): Promise<AgentJob> {
    const job = await this.edit(bundleId, (log, now) => {
      const j = this.find(log, jobId);
      if (j.status !== 'queued' && j.status !== 'running') return j;
      const attempt = j.attempts[j.attempts.length - 1];
      if (attempt?.outcome === 'running') { attempt.outcome = 'cancelled'; attempt.finishedAt = now; attempt.error = '本人が中断しました。'; }
      j.status = 'cancelled'; j.updatedAt = now; j.leaseUntil = null; return j;
    });
    this.active.get(`${bundleId}/${jobId}`)?.abort(); return job;
  }
  async apply(bundleId: string, jobId: string, expectedVersion: string, contentHash: string): Promise<AgentJob> {
    const { metadata, version, log } = await this.read(bundleId);
    const job = this.find(log, jobId);
    if (job.status !== 'succeeded') throw new AgentError(409, '適用できる成果物候補がありません。');
    const artifact = artifactFor(job);
    const hash = createHash('sha256').update(`# ${artifact.title}\n${artifact.body}`).digest('hex');
    if (hash !== contentHash) throw new AgentError(409, '確認した成果物と一致しません。差分を再確認してください。');
    if (job.applied) return job;
    if (version !== expectedVersion) throw new AgentError(409, 'Bundleの保存版が変わりました。再取得して内容を再確認してください。');
    const now = new Date(Math.max(Date.now(), Date.parse(version) + 1)).toISOString();
    job.applied = { thinkId: artifact.thinkId, confirmedAt: now, contentHash: hash }; job.updatedAt = now;
    const saved = await this.store.applyAgentArtifact(bundleId, version, { ...metadata, thinkAgentJobs: log }, now,
      { ...artifact, metadata: { thinkAgentArtifact: { schemaVersion: 1, jobId, bundleId, contentHash: hash } } });
    if (!saved.success) throw new AgentError(503, '適用結果を確認できません。状態を再取得してください。');
    if (!saved.data) throw new AgentError(409, '保存競合または成果物IDの衝突です。既存Thinkを上書きしていません。');
    return job;
  }
  async readArtifact(bundleId: string, jobId: string) {
    const job = this.find((await this.read(bundleId)).log, jobId);
    if (!job.applied) throw new AgentError(404, '成果物は未適用です。');
    const found = await this.store.getRecord(job.applied.thinkId);
    if (!found.success) throw new AgentError(503, '成果物を取得できません。');
    const r = found.data;
    if (!r || r.is_deleted || r.category !== 'memo') throw new AgentError(404, '適用先Thinkがありません。自動再作成は行いません。');
    const metadata: unknown = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata ?? {};
    if (!object(metadata) || !object(metadata.thinkAgentArtifact) || metadata.thinkAgentArtifact.jobId !== jobId || metadata.thinkAgentArtifact.bundleId !== bundleId) throw new AgentError(409, '適用先の対応を確認できません。');
    const updatedAt = object(r.updated_at) && 'value' in r.updated_at ? String(r.updated_at.value) : String(r.updated_at);
    return { id: job.applied.thinkId, fullContent: `${r.title ?? ''}\n${r.content ?? ''}`, updatedAt, metadata };
  }
}
