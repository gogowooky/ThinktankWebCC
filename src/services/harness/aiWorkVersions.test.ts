// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
type Snap = { thinkid: string; title: string; body: string; metadata: Record<string, unknown>; sourceUpdatedAt: string; snapshotAt: string };
const storage = vi.hoisted(() => {
  let n = 0;
  return {
    supportsSnapshots: true,
    save: vi.fn(async () => ({ updatedAt: `2026-11-22T00:00:${String(++n).padStart(2, '0')}Z` })),
    updateMetadata: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({ updatedAt: '2026-11-22T01:00:00Z', metadata: patch })),
    delete: vi.fn(async () => undefined),
    getRecord: vi.fn(async () => null),
    getSnapshot: vi.fn(async (_id: string): Promise<Snap | null> => null),
    createSnapshot: vi.fn(async (_id: string) => ({}) as Snap),
    listSnapshots: vi.fn(async (_id: string): Promise<Snap[]> => []),
  };
});
vi.mock('../storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../../models/TTVault';
import { restoreAiWorkVersion, snapshotBeforeWrite } from './aiWorkVersions';

let vault: TTVault;
beforeEach(() => {
  vi.clearAllMocks();
  storage.supportsSnapshots = true;
  storage.getSnapshot.mockImplementation(async () => null);
  vault = new TTVault('vault');
});
const snap = (title: string, body: string): Snap => ({ thinkid: 'x', title, body, metadata: {}, sourceUpdatedAt: '', snapshotAt: '2026-11-21T00:00:00Z' });

async function aiWorkWith(content: string) {
  const think = await vault.CreateAiViewThink(content);
  return think;
}

it('最新のスナップショットと内容が違えば書き換え前に残す', async () => {
  const think = await aiWorkWith('P｜status\n- 次は見積もり');
  storage.getSnapshot.mockResolvedValueOnce(snap('P｜status', '- 次は調査'));
  expect(await snapshotBeforeWrite(think)).toBe(true);
  expect(storage.createSnapshot).toHaveBeenCalledWith(think.ID);
});

it('同じ内容・タイトル行だけ・非対応のときは残さない', async () => {
  const think = await aiWorkWith('P｜status\n- 次は見積もり\n');
  storage.getSnapshot.mockResolvedValueOnce(snap('P｜status', '- 次は見積もり'));
  expect(await snapshotBeforeWrite(think)).toBe(false);

  const empty = await aiWorkWith('P｜log');
  expect(await snapshotBeforeWrite(empty)).toBe(false);

  storage.supportsSnapshots = false;
  expect(await snapshotBeforeWrite(think)).toBe(false);
  expect(storage.createSnapshot).not.toHaveBeenCalled();
});

it('スナップショットに失敗しても書き換えを止めない', async () => {
  const think = await aiWorkWith('P｜log\n記録');
  storage.createSnapshot.mockRejectedValueOnce(new Error('通信失敗'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await snapshotBeforeWrite(think)).toBe(false);
  warn.mockRestore();
});

it('前の版へ戻すときは、戻す前の内容も残す', async () => {
  const think = await aiWorkWith('P｜decision\n- 15時で確定');
  await restoreAiWorkVersion(vault, think, snap('P｜decision', '- 14時と仮定'));
  expect(storage.createSnapshot).toHaveBeenCalledWith(think.ID);
  expect(think.Content).toBe('P｜decision\n- 14時と仮定');
});
