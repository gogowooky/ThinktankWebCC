import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExternalService } from './ExternalService';
import { ProgressService } from './ProgressService';
import { ThinkSupportService } from './ThinkSupportService';
import { StorageConflictError } from './storage/IStorageBackend';
import { emptyThinkValues } from '../../shared/contracts/thinkSupportRecord';
import { emptyProgress } from '../../shared/contracts/progressRecord';
import type { ExternalInput } from '../../shared/contracts/externalRecord';

const version = '2026-10-13T00:00:00.000Z';
const conflict = Object.assign(new Error('保存競合'), { code: 'VERSION_CONFLICT' });
let metadata: Record<string, unknown>;
const storage = {
  getRecord: vi.fn(async (id: string) => ({
    meta: { thinkid: id, category: 'bundle', title: 'B', keywords: '', relatedIds: '', sizeBytes: 0, isDeleted: false,
      createdAt: version, updatedAt: version, metadata },
    body: '', support: {}, updatedAt: version,
  })),
  saveSupport: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    metadata = { ...metadata, ...patch };
    return { thinkid: id, updatedAt: '2026-10-13T00:00:01.000Z', metadata };
  }),
};
beforeEach(() => {
  metadata = {}; vi.clearAllMocks();
  vi.stubGlobal('window', { electronAPI: { storage } });
});
afterEach(() => { vi.unstubAllGlobals(); });

const input: ExternalInput = { vaultId: 'vault', accountKey: 'work', provider: 'notebooklm-manual', notebookUrl: 'https://notebooklm.google.com/notebook/a', manifest: null };

it('records external links in the bundle metadata with the expected version, and replays the same operation idempotently', async () => {
  const client = new ExternalService();
  const read = await client.read('bundle');
  expect(read.log.events).toEqual([]);
  const saved = await client.save('bundle', read.version, 'op1', input);
  expect(storage.saveSupport).toHaveBeenCalledWith('bundle', { thinkExternal: saved.log }, version);
  expect(saved.version).toBe('2026-10-13T00:00:01.000Z');
  storage.saveSupport.mockClear();
  await expect(client.save('bundle', read.version, 'op1', input)).resolves.toMatchObject({ log: saved.log });
  expect(storage.saveSupport).not.toHaveBeenCalled();
  await expect(client.save('bundle', read.version, 'op1', { ...input, accountKey: 'other' })).rejects.toThrow('同じ操作IDの内容が異なります。');
});

it('refuses an external save based on a stale version', async () => {
  await expect(new ExternalService().save('bundle', '2026-01-01T00:00:00.000Z', 'op', input)).rejects.toThrow('保存競合');
  expect(storage.saveSupport).not.toHaveBeenCalled();
});

it('maps a storage version conflict to StorageConflictError for progress and manual state', async () => {
  storage.saveSupport.mockRejectedValueOnce(conflict);
  const progress = { ...emptyProgress(), milestones: { ...emptyProgress().milestones, execution: 'achieved' as const }, evidence: '予約済み', remaining: '人数確認' };
  await expect(new ProgressService().save('bundle', version, 'op', progress)).rejects.toBeInstanceOf(StorageConflictError);
  storage.saveSupport.mockRejectedValueOnce(conflict);
  await expect(new ThinkSupportService().save('bundle', version, emptyThinkValues(), {})).rejects.toBeInstanceOf(StorageConflictError);
});

it('retains the manual-state target check', async () => {
  storage.getRecord.mockResolvedValueOnce({ ...(await storage.getRecord('other')) });
  await expect(new ThinkSupportService().read('bundle')).rejects.toThrow('Bundleの保存情報を確認できません。');
});
