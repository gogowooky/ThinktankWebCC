import { beforeEach, expect, it, vi } from 'vitest';
import { FileSearchBindingService } from './FileSearchBindingService';
import { DisabledFileSearchProvider } from './FileSearchProvider';
import { latestBinding } from './fileSearchBindingRecord';
const version = '2026-09-14T00:00:00Z';
const metadata = { thinkSupport: { preserve: true }, thinkExternal: { preserve: true }, thinkConversations: { preserve: true } };
const record = { file_id: 'bundle', category: 'bundle', updated_at: version, metadata: JSON.stringify(metadata), content: '原本' };
const store = { getRecord: vi.fn(), saveThinkSupport: vi.fn() };
const provider = { status: vi.fn(), listStores: vi.fn(), getStore: vi.fn() };
const input = { vaultId: 'vault', connectionId: 'work', storeName: 'fileSearchStores/a', previousStoreName: null };
let service: FileSearchBindingService;
beforeEach(() => {
  vi.clearAllMocks(); store.getRecord.mockResolvedValue({ success: true, data: record }); store.saveThinkSupport.mockResolvedValue({ success: true, data: true });
  provider.getStore.mockImplementation(async (connectionId, name) => ({ connectionId, checkedAt: version, stores: [{ name, displayName: '資料', activeDocuments: '0', pendingDocuments: null, failedDocuments: null }], nextPageToken: null }));
  service = new FileSearchBindingService(store, provider);
});
it('reads without contacting Google and preserves unrelated metadata when binding an exact store', async () => {
  expect((await service.read('bundle')).log.events).toEqual([]); expect(provider.getStore).not.toHaveBeenCalled();
  const saved = await service.save('bundle', version, 'op', input);
  expect(provider.getStore).toHaveBeenCalledWith('work', 'fileSearchStores/a', undefined);
  expect(store.saveThinkSupport).toHaveBeenCalledWith('bundle', version, { ...metadata, thinkFileSearch: saved.log }, saved.version);
  expect(latestBinding(saved.log, 'vault', 'work')?.input.storeName).toBe(input.storeName); expect(record.content).toBe('原本');
});
it('retries a lost acknowledgment without a second verification or write', async () => {
  const saved = await service.save('bundle', version, 'op', input);
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, updated_at: saved.version, metadata: JSON.stringify({ ...metadata, thinkFileSearch: saved.log }) } });
  store.saveThinkSupport.mockClear(); provider.getStore.mockClear();
  expect((await service.save('bundle', version, 'op', input)).log).toEqual(saved.log);
  expect(store.saveThinkSupport).not.toHaveBeenCalled(); expect(provider.getStore).not.toHaveBeenCalled();
  await expect(service.save('bundle', version, 'op', { ...input, storeName: 'fileSearchStores/b' })).rejects.toMatchObject({ status: 409 });
});
it('requires the exact previous association and leaves remote stores untouched on local unlink', async () => {
  const saved = await service.save('bundle', version, 'op', input);
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, updated_at: saved.version, metadata: JSON.stringify({ ...metadata, thinkFileSearch: saved.log }) } });
  service = new FileSearchBindingService(store, new DisabledFileSearchProvider());
  await expect(service.save('bundle', saved.version, 'unlink', { ...input, storeName: null })).rejects.toMatchObject({ status: 409 });
  const unlinked = await service.save('bundle', saved.version, 'unlink', { ...input, storeName: null, previousStoreName: input.storeName });
  expect(unlinked.log.events).toHaveLength(2); expect(latestBinding(unlinked.log, 'vault', 'work')?.input.storeName).toBeNull();
  expect(unlinked.log.events[0]).toEqual(saved.log.events[0]);
});
it('separates Vault and connection identities without using display names', async () => {
  const saved = await service.save('bundle', version, 'op', input);
  expect(latestBinding(saved.log, 'other', 'work')).toBeUndefined(); expect(latestBinding(saved.log, 'vault', 'other')).toBeUndefined();
});
it('blocks stale writes before remote lookup and atomic conflicts after lookup', async () => {
  await expect(service.save('bundle', '2026-09-13T00:00:00Z', 'op', input)).rejects.toMatchObject({ status: 409 }); expect(provider.getStore).not.toHaveBeenCalled();
  store.saveThinkSupport.mockResolvedValue({ success: true, data: false });
  await expect(service.save('bundle', version, 'op', input)).rejects.toMatchObject({ status: 409 });
});
it('never persists a missing, mismatched or cancelled verification', async () => {
  provider.getStore.mockRejectedValueOnce(new Error('not accessible'));
  await expect(service.save('bundle', version, 'op', input)).rejects.toThrow();
  provider.getStore.mockResolvedValueOnce({ connectionId: 'work', checkedAt: version, stores: [], nextPageToken: null });
  await expect(service.save('bundle', version, 'op', input)).rejects.toThrow();
  const abort = new AbortController(); abort.abort();
  await expect(service.save('bundle', version, 'op', input, abort.signal)).rejects.toMatchObject({ status: 409 });
  expect(store.saveThinkSupport).not.toHaveBeenCalled();
});
it('rejects unsupported history, extra input and unknown save outcomes', async () => {
  const unexpected = { ...input, apiKey: 'secret' };
  await expect(service.save('bundle', version, 'op', unexpected)).rejects.toThrow();
  store.saveThinkSupport.mockResolvedValue({ success: false, error: 'offline' });
  await expect(service.save('bundle', version, 'op', input)).rejects.toMatchObject({ status: 503 });
  store.getRecord.mockResolvedValue({ success: true, data: { ...record, metadata: JSON.stringify({ thinkFileSearch: { schemaVersion: 2 } }) } });
  await expect(service.read('bundle')).rejects.toThrow();
});
