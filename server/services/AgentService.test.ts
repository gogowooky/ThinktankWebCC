import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { AgentService, type AgentStore } from './AgentService';
import { DisabledAIProvider, type AIProvider } from './AIProvider';
import { artifactFor, readAgentLog } from './agentRecord';
import type { ConversationContext } from './conversationRecord';
import type { VaultRecord } from './BigQueryService';

const context = (): ConversationContext => ({ schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId: 'bundle', capturedAt: '2026-09-14T00:00:00Z', scope: 'bundle-only', quality: 'complete',
  sources: [{ thinkId: 'source', title: '資料', content: '本文', contentHash: createHash('sha256').update('本文').digest('hex') }], manualState: null, issues: [] });
const answer = { reply: '資料の要約です。', insufficientEvidence: false, citations: [{ thinkId: 'source', quote: '本文' }], proposals: [] };
function setup() {
  const metadata = { keep: true, thoughtSupport: { state: '完了' }, thinkSupport: { goal: '保全' }, thinkProgress: { keep: 'progress' } };
  const records = new Map<string, VaultRecord>([['bundle', { file_id: 'bundle', category: 'bundle', content: '元の本文', updated_at: '2026-09-14T00:00:00Z', metadata: JSON.stringify(metadata) } as VaultRecord]]);
  const store: AgentStore = {
    getRecord: vi.fn(async id => ({ success: true, data: structuredClone(records.get(id) ?? null) })),
    saveThinkSupport: vi.fn(async (id, version, meta, now) => {
      const r = records.get(id)!;
      if (r.updated_at !== version) return { success: true, data: false };
      records.set(id, { ...r, updated_at: now, metadata: JSON.stringify(meta) }); return { success: true, data: true };
    }),
    applyAgentArtifact: vi.fn(async (id, version, meta, now, artifact) => {
      const r = records.get(id)!;
      if (r.updated_at !== version || records.has(artifact.thinkId)) return { success: true, data: false };
      records.set(artifact.thinkId, { file_id: artifact.thinkId, category: 'memo', title: `# ${artifact.title}`, content: artifact.body, metadata: JSON.stringify(artifact.metadata), updated_at: now } as VaultRecord);
      records.set(id, { ...r, updated_at: now, metadata: JSON.stringify(meta) }); return { success: true, data: true };
    }),
  };
  const provider: AIProvider = { name: 'test', model: 'model', generate: vi.fn(async () => answer) };
  return { service: new AgentService(provider, store), store, records, metadata, provider };
}
it('registers without executing AI and rejects reuse of an ID with different inputs', async () => {
  const { service, provider } = setup();
  const job = await service.create('job', 'summary', '', context()); expect(job.status).toBe('queued');
  expect(provider.generate).not.toHaveBeenCalled();
  await service.create('job', 'summary', '', context()); expect((await service.read('bundle')).log.jobs).toHaveLength(1);
  await expect(service.create('job', 'comparison', '', context())).rejects.toThrow('別の依頼');
});
it('does not touch storage or AI when execution is disabled', async () => {
  const { store } = setup(); const service = new AgentService(new DisabledAIProvider(), store);
  await expect(service.run('bundle', 'job', false)).rejects.toThrow('停止中'); expect(store.getRecord).not.toHaveBeenCalled();
});
it('produces a candidate with citations while preserving original metadata and content', async () => {
  const { service, records, metadata, provider } = setup(); await service.create('job', 'comparison', '比較する', context());
  const job = await service.run('bundle', 'job', false);
  expect(job.status).toBe('succeeded'); expect(artifactFor(job).body).toContain('本文ハッシュ'); expect(records.size).toBe(1);
  expect(JSON.parse(records.get('bundle')!.metadata!)).toMatchObject(metadata); expect(records.get('bundle')!.content).toBe('元の本文');
  await service.run('bundle', 'job', false); expect(provider.generate).toHaveBeenCalledTimes(1);
  expect(vi.mocked(provider.generate).mock.calls[0][0].history).toEqual([]);
});
it('rejects fabricated citations and requires explicit retry before another model call', async () => {
  const { service, provider } = setup(); vi.mocked(provider.generate).mockResolvedValueOnce({ ...answer, citations: [{ thinkId: 'outside', quote: '架空' }] });
  await service.create('job', 'summary', '', context()); const failed = await service.run('bundle', 'job', false);
  expect(failed.status).toBe('failed'); expect(failed.result).toBeNull();
  await expect(service.run('bundle', 'job', false)).rejects.toThrow('再実行には');
  const retried = await service.run('bundle', 'job', true); expect(retried.status).toBe('succeeded'); expect(retried.attempts.map(a => a.outcome)).toEqual(['failed', 'succeeded']);
});
it('cancels only the selected job and rejects its late result', async () => {
  const { service, provider } = setup(); let resolve!: (value: unknown) => void;
  vi.mocked(provider.generate).mockImplementation(() => new Promise(r => { resolve = r; }));
  await service.create('job', 'summary', '', context()); await service.create('other', 'summary', '', context());
  const running = service.run('bundle', 'job', false); await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledTimes(1));
  expect((await service.cancel('bundle', 'job')).status).toBe('cancelled'); resolve(answer);
  expect((await running).status).toBe('cancelled'); expect((await service.read('bundle')).log.jobs.find(j => j.id === 'other')?.status).toBe('queued');
});
it('prevents a stale worker from replacing the result of a new attempt', async () => {
  const { service, provider, store, records } = setup(); let resolve!: (value: unknown) => void;
  vi.mocked(provider.generate).mockImplementation(() => new Promise(r => { resolve = r; }));
  await service.create('job', 'summary', '', context()); const oldRun = service.run('bundle', 'job', false);
  await vi.waitFor(() => expect(provider.generate).toHaveBeenCalled());
  const r = records.get('bundle')!; const meta = JSON.parse(r.metadata!); meta.thinkAgentJobs.jobs[0].leaseUntil = '2020-01-01T00:00:00Z'; r.metadata = JSON.stringify(meta);
  const next = new AgentService({ name: 'test', model: 'new-model', generate: async () => ({ ...answer, reply: '新しい結果' }) }, store);
  expect((await next.run('bundle', 'job', true)).result?.reply).toBe('新しい結果'); resolve(answer);
  expect((await oldRun).result?.reply).toBe('新しい結果');
});
it('requires a matching artifact hash and base version, then applies once without overwrites', async () => {
  const { service, store, records } = setup(); await service.create('job', 'summary', '', context());
  const job = await service.run('bundle', 'job', false); const artifact = artifactFor(job);
  const hash = createHash('sha256').update(`# ${artifact.title}\n${artifact.body}`).digest('hex');
  const version = (await service.read('bundle')).version;
  await expect(service.apply('bundle', 'job', version, 'bad')).rejects.toThrow('一致しません');
  await expect(service.apply('bundle', 'job', 'stale', hash)).rejects.toThrow('保存版');
  const applied = await service.apply('bundle', 'job', version, hash); expect(applied.applied?.thinkId).toBe(artifact.thinkId);
  await service.apply('bundle', 'job', version, hash); expect(store.applyAgentArtifact).toHaveBeenCalledTimes(1); expect(records.size).toBe(2);
  expect((await service.readArtifact('bundle', 'job')).fullContent).toBe(`# ${artifact.title}\n${artifact.body}`);
});
it('rejects unknown history formats, tampered snapshots, and artifact ID collisions', async () => {
  expect(() => readAgentLog({ schemaVersion: 2, jobs: [] }, 'bundle')).toThrow();
  const { service, records } = setup(); const changed = context(); changed.sources[0].content = '変更';
  await expect(service.create('job', 'summary', '', changed)).rejects.toThrow('ハッシュ');
  await service.create('job', 'summary', '', context()); const job = await service.run('bundle', 'job', false);
  const artifact = artifactFor(job); records.set(artifact.thinkId, { content: '既存データ' } as VaultRecord);
  const hash = createHash('sha256').update(`# ${artifact.title}\n${artifact.body}`).digest('hex');
  await expect(service.apply('bundle', 'job', (await service.read('bundle')).version, hash)).rejects.toThrow('衝突');
  expect(records.get(artifact.thinkId)?.content).toBe('既存データ');
});
