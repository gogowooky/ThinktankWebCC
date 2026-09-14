import { apiFetch } from './apiClient';
import { object, type ConversationContext } from '../../server/services/conversationRecord';
import { readAgentLog, type AgentJob, type AgentKind, type AgentLog } from '../../server/services/agentRecord';
export interface AgentState { bundleId: string; version: string; log: AgentLog }
const base = '/api/think-support/agents';
async function json(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error : 'Agent APIとの通信に失敗しました。');
  return value;
}
export class AgentClient {
  async status(): Promise<{ enabled: boolean; provider: string; model: string }> {
    const value = await json(await apiFetch(`${base}/status`));
    if (!object(value) || typeof value.enabled !== 'boolean' || typeof value.provider !== 'string' || typeof value.model !== 'string') throw new Error('接続状態が不正です。');
    return { enabled: value.enabled, provider: value.provider, model: value.model };
  }
  async read(bundleId: string): Promise<AgentState> {
    const value = await json(await apiFetch(`${base}/bundles/${encodeURIComponent(bundleId)}`));
    if (!object(value) || value.bundleId !== bundleId || typeof value.version !== 'string' || !Number.isFinite(Date.parse(value.version))) throw new Error('ジョブの対象が一致しません。');
    return { bundleId, version: value.version, log: readAgentLog(value.log, bundleId) };
  }
  private async job(path: string, body: unknown, bundleId: string, jobId: string): Promise<AgentJob> {
    const value = await json(await apiFetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const job = readAgentLog({ schemaVersion: 1, jobs: [value] }, bundleId).jobs[0];
    if (job.id !== jobId) throw new Error('ジョブの応答IDが一致しません。');
    return job;
  }
  create(jobId: string, kind: AgentKind, instruction: string, context: ConversationContext) {
    return this.job('/jobs', { jobId, kind, instruction, context, confirmed: true }, context.bundleId, jobId);
  }
  action(bundleId: string, jobId: string, action: 'run' | 'cancel' | 'apply', extra: Record<string, unknown> = {}) {
    return this.job(`/bundles/${encodeURIComponent(bundleId)}/jobs/${encodeURIComponent(jobId)}/${action}`, { ...extra, confirmed: true }, bundleId, jobId);
  }
  async artifact(bundleId: string, jobId: string) {
    const value = await json(await apiFetch(`${base}/bundles/${encodeURIComponent(bundleId)}/jobs/${encodeURIComponent(jobId)}/artifact`));
    if (!object(value) || typeof value.id !== 'string' || typeof value.fullContent !== 'string' || typeof value.updatedAt !== 'string' || !object(value.metadata)) throw new Error('成果物の形式が不正です。');
    return { id: value.id, fullContent: value.fullContent, updatedAt: value.updatedAt, metadata: value.metadata };
  }
}
