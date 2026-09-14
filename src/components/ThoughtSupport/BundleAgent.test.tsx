// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ read: vi.fn(), status: vi.fn(), create: vi.fn(), action: vi.fn(), context: vi.fn(), artifact: vi.fn() }));
vi.mock('../../services/AgentClient', () => ({ AgentClient: class { read = api.read; status = api.status; create = api.create; action = api.action; artifact = api.artifact; } }));
vi.mock('../../services/ContextService', () => ({ ContextService: class { getBundleContext = api.context; } }));
vi.mock('../../services/ConversationService', () => ({ conversationContext: (value: unknown) => value }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { BundleAgent } from './BundleAgent';
import { TTVault } from '../../models/TTVault';
import type { AgentJob } from '../../../server/services/agentRecord';
const context = (bundleId = 'a') => ({ schemaVersion: 1 as const, snapshotId: 'snapshot', vaultId: 'vault', bundleId, capturedAt: '2026-09-14T00:00:00Z', scope: 'bundle-only' as const, quality: 'complete' as const,
  sources: [{ thinkId: 'source', title: '資料', content: '本文', contentHash: 'a'.repeat(64) }], manualState: null, issues: [] });
const job = (): AgentJob => ({ schemaVersion: 1, id: 'job', kind: 'summary', instruction: 'Aの依頼', context: context(), createdAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
  status: 'queued', attempts: [], leaseUntil: null, result: null, provider: '', model: '', applied: null });
const state = (bundleId = 'a', jobs: AgentJob[] = [job()]) => ({ bundleId, version: '2026-09-14T00:00:00Z', log: { schemaVersion: 1, jobs } });
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); root = createRoot(host); vault = new TTVault('vault');
  api.read.mockImplementation(async id => state(id, id === 'a' ? [job()] : [])); api.status.mockResolvedValue({ enabled: true, provider: 'test', model: 'model' });
  api.context.mockImplementation(async id => context(id)); api.create.mockResolvedValue(job()); api.action.mockResolvedValue(job());
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function show(id = 'a') { await act(async () => root.render(<BundleAgent vault={vault} bundleId={id} onOpen={vi.fn()} />)); }
function button(label: string) { return [...host.querySelectorAll('button')].find(b => b.textContent === label)!; }
async function click(label: string) { await act(async () => { expect(button(label).disabled).toBe(false); button(label).click(); }); }
async function approveJob() { await act(async () => (host.querySelector('article input[type=checkbox]') as HTMLInputElement).click()); }
it('does not call APIs on display and cannot run AI when disabled', async () => {
  api.status.mockResolvedValue({ enabled: false, provider: 'none', model: '' }); await show(); expect(api.read).not.toHaveBeenCalled();
  await click('ジョブと接続状態を取得'); await approveJob(); expect(button('ジョブを実行').disabled).toBe(true); expect(api.action).not.toHaveBeenCalled();
});
it('requires scope confirmation to register, and registration never runs AI', async () => {
  await show(); await click('ジョブの資料を取得'); expect(button('ジョブを登録').disabled).toBe(true);
  await act(async () => (host.querySelector('fieldset input[type=checkbox]') as HTMLInputElement).click()); await click('ジョブを登録');
  expect(api.create).toHaveBeenCalledWith(expect.any(String), 'summary', '', context()); expect(api.action).not.toHaveBeenCalled();
});
it('keeps a late run response and its refresh attached to its original Bundle', async () => {
  let resolve!: (value: AgentJob) => void; api.action.mockImplementation(() => new Promise(r => { resolve = r; }));
  await show(); await click('ジョブと接続状態を取得'); await approveJob(); await click('ジョブを実行');
  await show('b'); await click('ジョブと接続状態を取得'); await act(async () => resolve(job()));
  expect(api.action).toHaveBeenCalledWith('a', 'job', 'run', { retry: false }); expect(host.textContent).not.toContain('Aの依頼');
  await show('a'); expect(host.textContent).toContain('Aの依頼');
});
it('has a separate cancel operation while a job run request is pending', async () => {
  let resolve!: (value: AgentJob) => void;
  api.action.mockImplementation((_id, _job, action) => action === 'run' ? new Promise(r => { resolve = r; }) : Promise.resolve({ ...job(), status: 'cancelled' }));
  await show(); await click('ジョブと接続状態を取得'); await approveJob(); await click('ジョブを実行'); await click('このジョブを中断');
  expect(api.action).toHaveBeenCalledWith('a', 'job', 'cancel'); await act(async () => resolve({ ...job(), status: 'cancelled' }));
});
it('blocks Think creation when source content changed after generation', async () => {
  const complete: AgentJob = { ...job(), status: 'succeeded', result: { reply: '成果物', insufficientEvidence: true, citations: [], proposals: [] } };
  api.read.mockResolvedValue(state('a', [complete])); api.context.mockResolvedValue({ ...context(), sources: [] });
  await show(); await click('ジョブと接続状態を取得'); await approveJob(); await click('成果物を新しいThinkへ追加');
  expect(api.action).not.toHaveBeenCalled(); expect(host.textContent).toContain('生成時点から変わっています');
});
