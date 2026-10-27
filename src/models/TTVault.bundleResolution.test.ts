import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ getBody: vi.fn(), listMeta: vi.fn(), save: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: backend } }));

import { TTThink } from './TTThink';
import { TTVault } from './TTVault';
import type { ThinkMeta } from '../services/storage/IStorageBackend';

const ROOT = '2026-10-13-100000';
const NESTED = '2026-10-13-100001';
const A = '2026-10-12-110000';
const B = '2026-10-13-110000';
const MISSING = '2026-10-15-110000';

function item(id: string, content: string, type: 'memo' | 'project' = 'memo') {
  const think = new TTThink();
  think.ID = id;
  think.ContentType = type;
  think.setContentSilent(content);
  think.markSaved();
  think.markMetadataSaved();
  return think;
}

function vault(...thinks: TTThink[]) {
  const result = new TTVault('test');
  result.IsLoaded = true;
  for (const think of thinks) result.AddThink(think);
  return result;
}

function meta(think: TTThink): ThinkMeta {
  return {
    thinkid: think.ID,
    category: think.ContentType,
    title: think.TitleLine,
    keywords: think.Keywords,
    relatedIds: think.RelatedIDs,
    sizeBytes: 0,
    isDeleted: false,
    createdAt: '',
    updatedAt: think.UpdatedAt,
    metadata: think.Metadata,
  };
}

function ids(thinks: TTThink[]) {
  return thinks.map(think => think.ID);
}

beforeEach(() => {
  vi.clearAllMocks();
  backend.getBody.mockResolvedValue(null);
  backend.save.mockResolvedValue({ updatedAt: '2026-10-13T12:00:00Z' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('resolves nested ID lists and reports cycles and missing IDs', async () => {
  const root = item(ROOT, `root\n* ${NESTED}\n* ${MISSING}`, 'project');
  const child = item(NESTED, `child\n* ${ROOT}\n* ${A}`, 'project');
  const v = vault(root, child, item(A, 'A'), item(B, 'B'));
  const onIssue = vi.fn();
  const onBundle = vi.fn();

  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A]);
  expect(ids(await v.GetThinksForBundleAsync(ROOT, true, { onIssue, onBundle }))).toEqual([A]);
  expect(onBundle.mock.calls.map(([think]) => think.ID)).toEqual([ROOT, NESTED]);
  expect(onIssue.mock.calls.map(([issue]) => issue)).toEqual([
    { code: 'cycle', thinkId: ROOT },
    { code: 'missing_think', thinkId: MISSING },
  ]);
});

it('ignores retired filter/search expressions and treats an empty Bundle as an empty list', async () => {
  const root = item(ROOT, 'root\n> Keyword：A\n> 作成日：2026-10-12\n>> 検索語：B', 'project');
  const v = vault(root, item(A, 'A'), item(B, 'B'));

  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
  expect(await v.GetThinksForBundleAsync(ROOT)).toEqual([]);
});

it('loads a meta-only Bundle body and reuses the explicit membership cache', async () => {
  const root = item(ROOT, 'root', 'project');
  root.IsMetaOnly = true;
  const b = item(B, 'B');
  const v = vault(root, b);
  backend.getBody.mockResolvedValue(`* ${B}`);

  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
  expect(ids(await v.GetThinksForBundleAsync(ROOT, true))).toEqual([B]);
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
  expect(backend.getBody).toHaveBeenCalledTimes(1);
});

it('preserves strict and partial-load behavior', async () => {
  const root = item(ROOT, 'root', 'project');
  root.IsMetaOnly = true;
  const v = vault(root, item(A, 'A'));
  root.LoadContent = vi.fn(async () => {});

  expect(await v.GetThinksForBundleAsync(ROOT)).toEqual([]);
  await expect(v.GetThinksForBundleAsync(ROOT, true)).rejects.toThrow('Bundle本文を読み込めませんでした');
});

it('invalidates membership after root and nested Bundle edits', async () => {
  const root = item(ROOT, `root\n* ${NESTED}`, 'project');
  const child = item(NESTED, `child\n* ${A}`, 'project');
  const v = vault(root, child, item(A, 'A'), item(B, 'B'));

  expect(ids(await v.GetThinksForBundleAsync(ROOT))).toEqual([A]);
  child.Content = `child\n* ${B}`;
  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([B]);
  root.Content = 'root';
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
});

it('invalidates an empty-list cache on additions without broadening membership', async () => {
  const v = vault(item(ROOT, 'root', 'project'), item(A, 'A'));
  await v.GetThinksForBundleAsync(ROOT);
  v.AddThink(item(B, 'B'));
  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
});

it('drops cache across ReloadAll even when reloaded Think IDs are identical', async () => {
  const root = item(ROOT, `root\n* ${A}`, 'project');
  const a = item(A, 'A');
  const b = item(B, 'B');
  const v = vault(root, a, b);
  await v.GetThinksForBundleAsync(ROOT);
  backend.listMeta.mockResolvedValue([meta(root), meta(a), meta(b)]);
  backend.getBody.mockResolvedValue(`* ${B}`);

  await v.ReloadAll();

  expect(v.GetThinksForBundle(ROOT)).toEqual([]);
  expect(ids(await v.GetThinksForBundleAsync(ROOT, true))).toEqual([B]);
  expect(v.GetThink(ROOT)).not.toBe(root);
});

it('keeps a cached ID list through a notification with unchanged inputs', async () => {
  const root = item(ROOT, `root\n* ${A}`, 'project');
  const a = item(A, 'A');
  const v = vault(root, a);
  await v.GetThinksForBundleAsync(ROOT);

  v.NotifyUpdated();

  expect(ids(v.GetThinksForBundle(ROOT))).toEqual([A]);
});
