import { beforeEach, expect, it, vi } from 'vitest';
import type { ThinkMeta } from '../services/storage/IStorageBackend';

const storage = vi.hoisted(() => ({
  listMeta: vi.fn(),
  listMetaCached: vi.fn(),
  getBody: vi.fn(),
  knownMeta: vi.fn(),
  save: vi.fn(),
}));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));

import { TTVault } from './TTVault';

function meta(thinkid: string, title: string, updatedAt = '2026-11-01T00:00:00.000Z', extra: Partial<ThinkMeta> = {}): ThinkMeta {
  return {
    thinkid, category: 'memo', title, keywords: '', relatedIds: '', sizeBytes: 1, isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt, ...extra,
  };
}

const NEWER = '2026-11-02T00:00:00.000Z';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.knownMeta.mockReturnValue(null);
  storage.listMetaCached.mockResolvedValue(null);
});

it('shows the cached list before the full list arrives', async () => {
  const fresh = deferred<ThinkMeta[]>();
  storage.listMetaCached.mockResolvedValue([meta('a', '古い題')]);
  storage.listMeta.mockReturnValue(fresh.promise);
  const vault = new TTVault();

  const loading = vault.LoadCache(true);
  await vi.waitFor(() => expect(vault.IsLoaded).toBe(true));
  expect(vault.GetThink('a')?.Name).toBe('古い題');

  fresh.resolve([meta('a', '新しい題', NEWER)]);
  await loading;
  expect(vault.GetThink('a')?.Name).toBe('新しい題');
  expect(vault.GetThink('a')?.UpdatedAt).toBe(NEWER);
  expect(vault.GetThink('a')?.IsDirty).toBe(false);
});

it('adds new Thinks and removes ones deleted elsewhere', async () => {
  storage.listMetaCached.mockResolvedValue([meta('a', 'A'), meta('deleted', '消えた')]);
  storage.listMeta.mockResolvedValue([meta('a', 'A'), meta('new', '増えた')]);
  const vault = new TTVault();

  await vault.LoadCache(true);

  expect(vault.GetThink('deleted')).toBeUndefined();
  expect(vault.GetThink('new')?.Name).toBe('増えた');
  expect(vault.Count).toBe(2);
  expect(vault.ListRevision).toBe(1);
  expect(vault.GetThinks().map(t => t.ID).sort()).toEqual(['a', 'new']);
});

it('keeps a Think created after the cached list was shown', async () => {
  const fresh = deferred<ThinkMeta[]>();
  storage.listMetaCached.mockResolvedValue([meta('a', 'A')]);
  storage.listMeta.mockReturnValue(fresh.promise);
  storage.save.mockResolvedValue(meta('created', '作成', NEWER));
  const vault = new TTVault();

  const loading = vault.LoadCache(true);
  await vi.waitFor(() => expect(vault.IsLoaded).toBe(true));
  const created = await vault.CreateBlankThink('memo', '作成');
  fresh.resolve([meta('a', 'A')]);
  await loading;

  expect(vault.GetThink(created.ID)).toBe(created);
});

it('does not touch a Think with unsaved edits', async () => {
  const fresh = deferred<ThinkMeta[]>();
  storage.listMetaCached.mockResolvedValue([meta('a', '元の題')]);
  storage.listMeta.mockReturnValue(fresh.promise);
  const vault = new TTVault();

  const loading = vault.LoadCache(true);
  await vi.waitFor(() => expect(vault.IsLoaded).toBe(true));
  const think = vault.GetThink('a')!;
  think.Content = '編集中の題\n本文';
  fresh.resolve([meta('a', '別の端末の題', NEWER)]);
  await loading;

  expect(think.Content).toBe('編集中の題\n本文');
  // 版を進めないので、保存すると楽観ロックが衝突として知らせる
  expect(think.UpdatedAt).toBe('2026-11-01T00:00:00.000Z');
});

it('does not roll back to a list older than a save made meanwhile', async () => {
  const fresh = deferred<ThinkMeta[]>();
  storage.listMetaCached.mockResolvedValue([meta('a', 'A')]);
  storage.listMeta.mockReturnValue(fresh.promise);
  const vault = new TTVault();

  const loading = vault.LoadCache(true);
  await vi.waitFor(() => expect(vault.IsLoaded).toBe(true));
  vault.GetThink('a')!.UpdatedAt = NEWER;
  fresh.resolve([meta('a', '古い一覧の題')]);
  await loading;

  expect(vault.GetThink('a')?.Name).toBe('A');
});

it('keeps the cached list visible and reports the error when the full list fails', async () => {
  storage.listMetaCached.mockResolvedValue([meta('a', 'A')]);
  storage.listMeta.mockRejectedValue(new Error('offline'));
  const vault = new TTVault();
  vi.useFakeTimers();
  const loading = vault.LoadCache(true);
  await vi.runAllTimersAsync();
  await loading;
  vi.useRealTimers();

  expect(vault.GetThink('a')?.Name).toBe('A');
  expect(vault.LoadError).toMatchObject({ kind: 'error', message: 'offline' });
});

it('ignores a broken cache and waits for the full list', async () => {
  storage.listMetaCached.mockRejectedValue(new Error('broken'));
  storage.listMeta.mockResolvedValue([meta('a', 'A')]);
  const vault = new TTVault();

  await vault.LoadCache(true);

  expect(vault.GetThink('a')?.Name).toBe('A');
});

it('does not read the cache when reloading on request', async () => {
  storage.listMeta.mockResolvedValue([meta('a', 'A')]);
  const vault = new TTVault();

  await vault.ReloadAll();

  expect(storage.listMetaCached).not.toHaveBeenCalled();
});

it('takes version and metadata from the record when opening a cached Think', async () => {
  storage.listMetaCached.mockResolvedValue([meta('a', '古い題', undefined, { metadata: { old: true } })]);
  storage.listMeta.mockReturnValue(new Promise(() => {}));
  storage.getBody.mockResolvedValue('本文');
  storage.knownMeta.mockReturnValue(meta('a', '新しい題', NEWER, { metadata: { fresh: true } }));
  const vault = new TTVault();

  void vault.LoadCache(true);
  await vi.waitFor(() => expect(vault.IsLoaded).toBe(true));
  const think = vault.GetThink('a')!;
  await think.LoadContent();

  expect(think.Content).toBe('新しい題\n本文');
  expect(think.UpdatedAt).toBe(NEWER);
  expect(think.Metadata).toEqual({ fresh: true });
  expect(think.IsDirty).toBe(false);
  expect(think.IsMetadataDirty).toBe(false);
});
