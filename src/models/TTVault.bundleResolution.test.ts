import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ search: vi.fn(), getBody: vi.fn(), listMeta: vi.fn(), save: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: backend } }));
import { TTThink } from './TTThink';
import { TTVault } from './TTVault';
import type { ThinkMeta } from '../services/storage/IStorageBackend';

const ROOT = '2026-10-13-100000', NESTED = '2026-10-13-100001';
const A = '2026-10-12-110000', B = '2026-10-13-110000', C = '2026-10-14-110000', MISSING = '2026-10-15-110000';

function item(id: string, content: string, type: 'memo' | 'bundle' = 'memo') {
  const think = new TTThink();
  think.ID = id; think.ContentType = type; think.setContentSilent(content);
  think.markSaved(); think.markMetadataSaved();
  return think;
}
function vault(...thinks: TTThink[]) {
  const result = new TTVault('test'); result.IsLoaded = true;
  for (const think of thinks) result.AddThink(think);
  return result;
}
function meta(think: TTThink): ThinkMeta {
  return { thinkid: think.ID, category: think.ContentType, title: think.TitleLine, keywords: think.Keywords,
    relatedIds: think.RelatedIDs, sizeBytes: 0, isDeleted: false, createdAt: '', updatedAt: think.UpdatedAt, metadata: think.Metadata };
}
function ids(thinks: TTThink[]) { return thinks.map(think => think.ID); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks(); backend.search.mockResolvedValue([]); backend.getBody.mockResolvedValue(null);
  backend.save.mockResolvedValue({ updatedAt: '2026-10-13T12:00:00Z' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('shares nested membership, exclusions, last-condition precedence, and diagnostics', async () => {
  const root = item(ROOT, `root\n* ${NESTED}\n* ${MISSING}\n> Keyword：Beta\n- ${A}`, 'bundle');
  const child = item(NESTED, `child\n* ${ROOT}\n* ${A}\n> Keyword：Alpha`, 'bundle');
  const v = vault(root, child, item(A, 'Alpha'), item(B, 'Beta'));
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
  const onIssue = vi.fn(); const onBundle = vi.fn();
  expect(ids(await v.GetThinksForBundleAsync(ROOT, true, { onIssue, onBundle }))).toEqual([B]);
  expect(onBundle.mock.calls.map(([think]) => think.ID)).toEqual([ROOT, NESTED]);
  expect(onIssue.mock.calls.map(([issue]) => issue)).toEqual([
    { code: 'cycle', thinkId: ROOT }, { code: 'conflicting_conditions', thinkId: ROOT }, { code: 'missing_think', thinkId: MISSING },
  ]);
});

it('applies created and updated date conditions equally to filters and search metadata', async () => {
  const root = item(ROOT, 'root\n> 作成日：2026-10-12\n> 更新日：2026-10-13\n>> 検索語：needle\n>> 作成日：2026-10-13\n>> 更新日：2026-10-14', 'bundle');
  const a = item(A, 'A'); a.UpdatedAt = '2026-10-13T01:00:00Z';
  const b = item(B, 'B'); b.UpdatedAt = '2026-10-14T01:00:00Z';
  const c = item('2026-10-13-120000', 'C'); c.UpdatedAt = '2026-10-13T01:00:00Z';
  const v = vault(root, a, b, c);
  backend.search.mockResolvedValue([meta(b), meta(c), meta(root)]);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A]);
  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([A, B]);
  expect(backend.search).toHaveBeenCalledWith('needle');
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A, B]);
});

it('keeps date-only search asynchronous and preserves the implicit-all option', async () => {
  const root = item(ROOT, 'root\n>> 作成日：2026-10-13', 'bundle');
  const b = item(B, 'B'); const v = vault(root, item(A, 'A'), b);
  backend.search.mockResolvedValue([meta(b)]);
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([B]);
  expect(backend.search).toHaveBeenCalledWith('');
  root.Content = 'root';
  const onIssue = vi.fn();
  expect(await v.GetThinksForBundleAsync(ROOT, true, { allowImplicitAll: false, onIssue })).toEqual([]);
  expect(onIssue).toHaveBeenCalledWith({ code: 'implicit_all_blocked', thinkId: ROOT });
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A, B]);
});

it('allows its own silent Bundle load to produce a reusable search cache', async () => {
  const root = item(ROOT, 'root', 'bundle'); root.IsMetaOnly = true;
  const b = item(B, 'B'); const v = vault(root, b);
  backend.getBody.mockResolvedValue('>> 検索語：needle'); backend.search.mockResolvedValue([meta(b)]);
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
  expect(ids(await v.GetThinksForBundleAsync(ROOT, true))).toEqual([B]);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
  expect(backend.getBody).toHaveBeenCalledTimes(1);
  expect(backend.search).toHaveBeenCalledTimes(1);
});

it('preserves strict and partial-load behavior and invalidates after a later silent load', async () => {
  const root = item(ROOT, 'root', 'bundle'); root.IsMetaOnly = true;
  const v = vault(root, item(A, 'A'), item(B, 'B'));
  root.LoadContent = vi.fn(async () => {});
  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([A, B]);
  await expect(v.GetThinksForBundleAsync(ROOT, true)).rejects.toThrow('Bundle本文を読み込めませんでした');
  root.setContentSilent(`root\n* ${B}`); root.IsMetaOnly = false;
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
});

it('invalidates membership after root and nested Bundle edits', async () => {
  const root = item(ROOT, `root\n* ${NESTED}`, 'bundle');
  const child = item(NESTED, `child\n* ${A}`, 'bundle');
  const v = vault(root, child, item(A, 'A'), item(B, 'B'), item(C, 'C'));
  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([A]);
  child.Content = `child\n* ${B}`;
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
  await v.GetThinksForBundleAsync(ROOT);
  root.setContentSilent(`root\n* ${C}`);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([C]);
});

it.each(['metadata replacement', 'metadata mutation', 'keyword', 'updatedAt', 'ordinary content'])('invalidates search cache after %s', async change => {
  const root = item(ROOT, 'root\n>> 検索語：needle', 'bundle');
  const a = item(A, 'A'); a.Metadata = { nested: { value: 'before' } };
  const v = vault(root, a); backend.search.mockResolvedValue([meta(a)]);
  await v.GetThinksForBundleAsync(ROOT);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A]);
  if (change === 'metadata replacement') root.Metadata = { changed: true };
  else if (change === 'metadata mutation') a.Metadata.nested.value = 'after';
  else if (change === 'keyword') a.Keywords = 'after';
  else if (change === 'updatedAt') a.UpdatedAt = '2026-10-14T01:00:00Z';
  else a.Content = 'A\nchanged';
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
});

it('invalidates an implicit-all cache on additions, deletions, and clearing', async () => {
  const root = item(ROOT, 'root', 'bundle'); const v = vault(root, item(A, 'A'));
  await v.GetThinksForBundleAsync(ROOT);
  v.AddThink(item(B, 'B')); expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A, B]);
  await v.GetThinksForBundleAsync(ROOT);
  v.DeleteItem(A); expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
  await v.GetThinksForBundleAsync(ROOT);
  v.ClearItems(); expect(v.GetThinksForBundle(ROOT)).toEqual([]);
});

it('invalidates before a newly registered Think finishes its first save', async () => {
  const v = vault(item(ROOT, 'root', 'bundle'), item(A, 'A'));
  await v.GetThinksForBundleAsync(ROOT);
  const saved = deferred<{ updatedAt: string }>(); backend.save.mockReturnValueOnce(saved.promise);
  const creation = v.CreateBlankThink('memo', 'new');
  expect(v.GetThinksForBundle(ROOT)).toHaveLength(2);
  saved.resolve({ updatedAt: '2026-10-13T12:00:00Z' }); await creation;
});

it('drops cache across ReloadAll even when reloaded Think IDs are identical', async () => {
  const root = item(ROOT, `root\n* ${A}`, 'bundle'); const a = item(A, 'A'), b = item(B, 'B');
  const v = vault(root, a, b); await v.GetThinksForBundleAsync(ROOT);
  backend.listMeta.mockResolvedValue([meta(root), meta(a), meta(b)]);
  backend.getBody.mockResolvedValue(`* ${B}`);
  await v.ReloadAll();
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
  expect(ids(await v.GetThinksForBundleAsync(ROOT, true))).toEqual([B]);
  expect(v.GetThink(ROOT)).not.toBe(root);
});

it('recomputes relative date conditions when the day changes', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
  const v = vault(item(ROOT, 'root\n> 作成日：,@0d', 'bundle'), item(B, 'today'), item(C, 'tomorrow'));
  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([B]);
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([C]);
});

it('keeps a newer search result cached when the same-condition older request finishes last', async () => {
  const a = item(A, 'A'), b = item(B, 'B');
  const v = vault(item(ROOT, 'root\n>> 検索語：needle', 'bundle'), a, b);
  const older = deferred<ThinkMeta[]>(), started = deferred<void>();
  backend.search.mockImplementationOnce(() => { started.resolve(); return older.promise; }).mockResolvedValueOnce([meta(b)]);
  const oldRequest = v.GetThinksForBundleAsync(ROOT); await started.promise;
  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([B]);
  older.resolve([meta(a)]); expect(ids(await oldRequest)).toEqual([A]);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
});

it.each(['Bundle edit', 'metadata mutation', 'reload'])('does not republish a result after %s during search', async change => {
  const root = item(ROOT, 'root\n>> 検索語：old', 'bundle'), a = item(A, 'A'), b = item(B, 'B');
  const v = vault(root, a, b);
  const older = deferred<ThinkMeta[]>(), started = deferred<void>();
  backend.search.mockImplementationOnce(() => { started.resolve(); return older.promise; });
  const oldRequest = v.GetThinksForBundleAsync(ROOT); await started.promise;
  if (change === 'Bundle edit') root.Content = 'root\n>> 検索語：new';
  else if (change === 'metadata mutation') root.Metadata.changed = true;
  else {
    backend.listMeta.mockResolvedValue([meta(root), meta(a), meta(b)]);
    await v.ReloadAll();
  }
  older.resolve([meta(a)]); await oldRequest;
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
});

it('does not hide external metadata edits while accepting an awaited Bundle content load', async () => {
  const root = item(ROOT, 'root', 'bundle'); root.IsMetaOnly = true;
  const a = item(A, 'A'); const v = vault(root, a);
  const body = deferred<string>(); backend.getBody.mockReturnValueOnce(body.promise); backend.search.mockResolvedValue([meta(a)]);
  const pending = v.GetThinksForBundleAsync(ROOT);
  root.Metadata.changed = true; body.resolve('>> 検索語：needle');
  expect(ids(await pending)).toEqual([A]);
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
});

it('preserves strict search failures and returns explicit membership for a non-strict failure', async () => {
  const v = vault(item(ROOT, `root\n* ${A}\n>> 検索語：needle`, 'bundle'), item(A, 'A'));
  backend.search.mockRejectedValue(new Error('offline'));
  await expect(v.GetThinksForBundleAsync(ROOT, true)).rejects.toThrow('offline');
  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([A]);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A]);
});

it('keeps the successful search cache through the Seeds result notification', async () => {
  const root = item(ROOT, `root\n* ${A}\n>> 検索語：needle`, 'bundle');
  const a = item(A, 'A'), b = item(B, 'B'); const v = vault(root, a, b);
  backend.search.mockResolvedValue([meta(b)]);
  const updated = vi.fn(); v.AddOnUpdate('test', updated);
  const displayed = await v.GetThinksForBundleAsync(ROOT).then(thinks => {
    v.NotifyUpdated();
    return thinks;
  });
  expect(ids(displayed)).toEqual([A, B]);
  expect(updated).toHaveBeenCalledTimes(1);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A, B]);
  v.NotifyUpdated(false);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A, B]);
  root.Content = `root\n* ${A}\n>> 検索語：changed`;
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A]);
});

it('does not invalidate an active search for a notification with unchanged inputs', async () => {
  const b = item(B, 'B'); const v = vault(item(ROOT, 'root\n>> 検索語：needle', 'bundle'), b);
  const response = deferred<ThinkMeta[]>(), started = deferred<void>();
  backend.search.mockImplementationOnce(() => { started.resolve(); return response.promise; });
  const request = v.GetThinksForBundleAsync(ROOT); await started.promise;
  v.NotifyUpdated();
  response.resolve([meta(b)]); await request;
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
});

it.each([false, true])('discards a prior success when the current search fails (strict=%s)', async strict => {
  const a = item(A, 'A'), b = item(B, 'B');
  const v = vault(item(ROOT, `root\n* ${A}\n>> 検索語：needle`, 'bundle'), a, b);
  backend.search.mockResolvedValueOnce([meta(b)]).mockRejectedValueOnce(new Error('offline'));
  await v.GetThinksForBundleAsync(ROOT);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A, B]);
  if (strict) await expect(v.GetThinksForBundleAsync(ROOT, true)).rejects.toThrow('offline');
  else expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([A]);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A]);
});

it.each([false, true])('does not discard a newer success when an older search fails (strict=%s)', async strict => {
  const a = item(A, 'A'), b = item(B, 'B'), c = item(C, 'C');
  const v = vault(item(ROOT, `root\n* ${A}\n>> 検索語：needle`, 'bundle'), a, b, c);
  backend.search.mockResolvedValueOnce([meta(b)]);
  await v.GetThinksForBundleAsync(ROOT);
  const older = deferred<ThinkMeta[]>(), started = deferred<void>();
  backend.search.mockImplementationOnce(() => { started.resolve(); return older.promise; }).mockResolvedValueOnce([meta(c)]);
  const oldRequest = v.GetThinksForBundleAsync(ROOT, strict);
  const oldCompletion = strict ? expect(oldRequest).rejects.toThrow('offline')
    : oldRequest.then(thinks => { expect(ids(thinks)).toEqual([A]); });
  await started.promise;
  await v.GetThinksForBundleAsync(ROOT);
  older.reject(new Error('offline')); await oldCompletion;
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A, C]);
});
