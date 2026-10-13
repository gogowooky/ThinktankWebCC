import { afterEach, expect, it, vi } from 'vitest';
import { BundleRepository, nextRecordVersion, type BundleStore } from './BundleRepository';
import type { VaultRecord } from './BigQueryService';

class ReadError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const version = '2026-10-13T00:00:00Z';
function setup(changes: Partial<VaultRecord> = {}, clone = false) {
  const record = { thinkid: 'bundle', category: 'bundle', updated_at: { value: version }, metadata: '{"keep":{"value":1}}', ...changes } as VaultRecord;
  const store = { getRecord: vi.fn().mockResolvedValue({ success: true, data: record }), saveThinkSupport: vi.fn().mockResolvedValue({ success: true, data: false }) };
  return { record, store, repository: new BundleRepository(store as BundleStore, ReadError, {}, clone) };
}
afterEach(() => { vi.restoreAllMocks(); });

it('reads metadata and a BigQuery timestamp without writing, then preserves the CAS outcome', async () => {
  const { repository, store } = setup();
  const state = await repository.read('bundle');
  expect(state).toMatchObject({ metadata: { keep: { value: 1 } }, version });
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
  await expect(repository.save('bundle', state.version, state.metadata, version)).resolves.toEqual({ success: true, data: false });
  expect(store.saveThinkSupport).toHaveBeenCalledWith('bundle', version, state.metadata, version);
});

it.each([{ category: 'chat' }, { is_deleted: true }])('rejects records outside the live Bundle set: %j', async changes => {
  await expect(setup(changes).repository.read('bundle')).rejects.toMatchObject({ status: 404 });
});

it('rejects unsafe IDs before I/O and preserves storage and version failures', async () => {
  const { repository, store } = setup();
  await expect(repository.read('../bundle')).rejects.toMatchObject({ status: 400 });
  expect(store.getRecord).not.toHaveBeenCalled();
  store.getRecord.mockResolvedValueOnce({ success: false, error: 'offline' });
  await expect(repository.read('bundle')).rejects.toMatchObject({ status: 503 });
  await expect(setup({ updated_at: 'invalid' }).repository.read('bundle')).rejects.toMatchObject({ status: 422 });
});

it('isolates mutable Agent logs from native metadata returned by the store', async () => {
  const metadata = { thinkAgentJobs: { jobs: [{ status: 'queued' }] } };
  const { repository } = setup({ metadata: metadata as unknown as string }, true);
  const state = await repository.read('bundle');
  (state.metadata.thinkAgentJobs as typeof metadata.thinkAgentJobs).jobs[0].status = 'running';
  expect(metadata.thinkAgentJobs.jobs[0].status).toBe('queued');
});

it('advances versions even when the stored clock is ahead of the local clock', () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(version) - 1000);
  expect(nextRecordVersion(version)).toBe('2026-10-13T00:00:00.001Z');
});
