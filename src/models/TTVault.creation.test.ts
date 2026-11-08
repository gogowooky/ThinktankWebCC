import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: backend } }));
import { TTVault } from './TTVault';
import { TTThink } from './TTThink';
import { projectTargetIds } from '../utils/thinkFormat';

const version = '2026-10-13T01:00:00Z';
const creators: Array<{ name: string; category: string; create: (vault: TTVault) => Promise<TTThink> }> = [
  { name: 'blank', category: 'memo', create: vault => vault.CreateBlankThink('memo', 'メモ') },
  { name: 'AI view', category: 'aiview', create: vault => vault.CreateBlankThink('aiview', 'AIまとめ') },
  { name: 'bundle', category: 'project', create: vault => vault.CreateBundleFromIds([]) },
  { name: 'links', category: 'links', create: vault => vault.CreateLinksThink({ target: 'https://example.com', title: 'リンク' }) },
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
  const bundle = await vault.AddThinkWithContent('2026-10-13-010000', '資料', 'project', '', '資料');
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

it('registers newly created Working-style Think files in the specified Seeds project target section', async () => {
  const vault = new TTVault('test');
  const project = await vault.CreateProject('作業');
  const memo = await vault.CreateBlankThink('memo', '新規メモ', project.ID);
  const { think: link } = await vault.GetOrCreateLinksThink({ target: 'https://example.com', title: '参照' }, '', project.ID);

  expect(projectTargetIds(project.Content)).toEqual([memo.ID, link.ID]);
  expect(project.Content).toContain(`[memo:${memo.ID}]: 新規メモ`);
  expect(project.Content).toContain(`[link:${link.ID}]: 参照`);
});

it('reuses an existing link file with the same target instead of creating another', async () => {
  const vault = new TTVault('test');
  const first = await vault.GetOrCreateLinksThink({ target: 'C:\\Docs\\Plan.md', title: 'Plan' });
  const second = await vault.GetOrCreateLinksThink({ target: 'c:/docs/plan.md', title: 'plan' });
  expect(first.created).toBe(true);
  expect(second).toEqual({ think: first.think, created: false });
  expect(vault.Count).toBe(1);
});

it('finds a link file whose body is not loaded yet by reading it', async () => {
  const vault = new TTVault('test');
  const meta = new TTThink();
  meta.ID = '2026-11-08-100000';
  meta.ContentType = 'links';
  meta.IsMetaOnly = true;
  const body = 'Example\n=\n# Caption\nExample\n# Link\nhttps://example.com/a\n# Affiliation\nexample.com\n# Abstract';
  meta.LoadContent = vi.fn(async () => { meta.setContentSilent(body); meta.IsMetaOnly = false; });
  vault.AddThink(meta);
  expect(await vault.FindLinksThink('https://example.com/a')).toBe(meta);
  expect(await vault.FindLinksThink('https://example.com/b')).toBeUndefined();
});
