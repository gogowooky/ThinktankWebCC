import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: backend } }));
import { TTVault } from './TTVault';
import { TTThink } from './TTThink';

const version = '2026-10-13T01:00:00Z';
const creators: Array<{ name: string; category: string; create: (vault: TTVault) => Promise<TTThink> }> = [
  { name: 'blank', category: 'memo', create: vault => vault.CreateBlankThink('memo', 'メモ') },
  { name: 'bundle', category: 'bundle', create: vault => vault.CreateBundleFromIds([]) },
  { name: 'links', category: 'links', create: vault => vault.CreateLinksThink('リンク', 'https://example.com') },
  { name: 'chat', category: 'chat', create: vault => vault.CreateChatThink('会話\n本文') },
  { name: 'fixed ID', category: 'memo', create: vault => vault.AddThinkWithContent('fixed', 'メモ', 'memo', 'keyword', 'メモ\n本文') },
];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.useFakeTimers();
  backend.save.mockReset().mockResolvedValue({ updatedAt: version });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it.each(creators)('$name exposes the pending item in the cache and publishes its saved version once', async ({ create, category }) => {
  const vault = new TTVault('test');
  expect(vault.GetThinks()).toEqual([]);
  const notified = vi.fn(); vault.AddOnUpdate('test', notified);
  const save = deferred<{ updatedAt: string }>(); backend.save.mockReturnValueOnce(save.promise);
  const creation = create(vault);
  expect(vault.Count).toBe(1);
  const pending = vault.GetThinks()[0];
  expect(pending.ContentType).toBe(category);
  expect(pending._parent).toBe(vault);
  expect(notified).not.toHaveBeenCalled();
  expect(backend.save.mock.calls[0][0]).toMatchObject({ thinkid: pending.ID, category, fullContent: pending.Content });
  save.resolve({ updatedAt: version });
  expect(await creation).toBe(pending);
  expect(pending.UpdatedAt).toBe(version);
  expect(pending.IsDirty).toBe(false);
  expect(notified).toHaveBeenCalledTimes(1);
});

it.each(creators)('$name rolls back a failed registration and invalidates the cached list', async ({ create }) => {
  const vault = new TTVault('test'); vault.GetThinks();
  const save = deferred<{ updatedAt: string }>(); backend.save.mockReturnValueOnce(save.promise);
  const creation = create(vault);
  const rejected = expect(creation).rejects.toThrow('offline');
  const pending = vault.GetThinks()[0]; expect(vault.Count).toBe(1);
  save.reject(new Error('offline')); await rejected;
  expect(vault.Count).toBe(0);
  expect(vault.GetThinks()).toEqual([]);
  expect(pending._parent).toBeNull();
});

it('restores an existing fixed-ID item after a failed replacement', async () => {
  const vault = new TTVault('test');
  const original = await vault.AddThinkWithContent('fixed', '元', 'memo', '', '元\n本文');
  vault.GetThinks(); backend.save.mockRejectedValueOnce(new Error('offline'));
  await expect(vault.AddThinkWithContent('fixed', '変更', 'memo', '', '変更')).rejects.toThrow('offline');
  expect(vault.GetThink('fixed')).toBe(original);
  expect(vault.GetThinks()).toEqual([original]);
  expect(vault.Count).toBe(1);
  expect(original._parent).toBe(vault);
});

it('clones creation metadata and uses the returned version on the next normal save', async () => {
  const vault = new TTVault('test'); const metadata = { nested: { value: 'initial' } };
  const think = await vault.CreateBlankThink('memo', 'メモ', undefined, metadata);
  metadata.nested.value = 'outside edit';
  expect(think.Metadata).toEqual({ nested: { value: 'initial' } });
  expect(think.IsMetadataDirty).toBe(false);
  think.Content = 'メモ\n追記'; await think.SaveContent();
  expect(backend.save.mock.calls[1][0]).toMatchObject({ baseUpdatedAt: version, fullContent: 'メモ\n追記' });
});

it('keeps a saved child and restores Bundle content when linking fails, allowing a retry', async () => {
  const vault = new TTVault('test');
  const bundle = await vault.AddThinkWithContent('2026-10-13-010000', '資料', 'bundle', '', '資料');
  const before = bundle.Content;
  backend.save.mockResolvedValueOnce({ updatedAt: version }).mockRejectedValueOnce(new Error('offline'));
  await expect(vault.CreateBlankThink('memo', '子', bundle.ID)).rejects.toThrow('offline');
  const child = vault.GetThinks().find(t => t !== bundle)!;
  expect(child).toBeTruthy(); expect(child.IsDirty).toBe(false);
  expect(bundle.Content).toBe(before);
  await vault.LinkThinksToBundle(bundle.ID, [child.ID]);
  expect(bundle.Content).toContain(child.ID);
  expect(vault.Count).toBe(2);
});
