// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { ensureSubtaskChat } from './subtaskChat';
import { parseBundle } from '../utils/thinkFormat';
let vault: TTVault, child: TTThink;
beforeEach(() => {
  storage.save.mockReset().mockResolvedValue({ updatedAt: '2026-09-17T00:00:00Z' });
  vault = new TTVault('vault'); child = new TTThink(); child.ID = 'child'; child.ContentType = 'bundle';
  child.Content = '会場予約\n* 2026-09-16-120000\n// このコメントを保持する\n';
  child.Metadata = { taskRelation: { schemaVersion: 1, parentId: 'parent', chatId: 'source-chat', turnId: 'turn', panel: 'Workout' }, custom: { keep: true } };
  child.markSaved(); child.markMetadataSaved(); child.UpdatedAt = '2026-09-16T00:00:00Z'; vault.AddThink(child);
});

it('creates one dedicated Chat, preserves Bundle text and metadata, and reuses it after reload', async () => {
  const before = child.Content;
  const [chat, again] = await Promise.all([ensureSubtaskChat(vault, child.ID), ensureSubtaskChat(vault, child.ID)]);
  expect(again.ID).toBe(chat.ID); expect(storage.save).toHaveBeenCalledTimes(2);
  expect(storage.save.mock.calls[0][0]).toMatchObject({ contentType: 'chat', metadata: { subtaskChat: { schemaVersion: 1, bundleId: 'child' } } });
  expect(storage.save.mock.calls[1][0]).toMatchObject({ baseUpdatedAt: '2026-09-16T00:00:00Z', metadata: child.Metadata });
  expect(child.Content).toBe(`${before}* ${chat.ID}\n`);
  expect(chat.Name).toBe('TASK:Workout｜会場予約'); expect(chat.IsMetadataDirty).toBe(false);
  const reloaded = new TTVault('vault'); reloaded.AddThink(child); reloaded.AddThink(chat);
  expect((await ensureSubtaskChat(reloaded, 'child')).ID).toBe(chat.ID);
  expect(storage.save).toHaveBeenCalledTimes(2);
});

it('retries only the Bundle link after partial failure, preserving the saved Chat', async () => {
  storage.save.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('競合'));
  const before = child.Content;
  await expect(ensureSubtaskChat(vault, child.ID)).rejects.toThrow('競合');
  expect(child.Content).toBe(before);
  const savedChat = vault.GetThinks().find(t => t.ContentType === 'chat')!;
  const chat = await ensureSubtaskChat(vault, child.ID);
  expect(chat.ID).toBe(savedChat.ID);
  expect(storage.save.mock.calls.filter(([r]) => r.contentType === 'chat')).toHaveLength(1);
  expect(parseBundle(child.Content).ids).toEqual(['2026-09-16-120000', chat.ID]);
});

it('rolls back failed Chat creation and refuses unsaved Bundle edits', async () => {
  storage.save.mockRejectedValueOnce(new Error('保存失敗'));
  await expect(ensureSubtaskChat(vault, child.ID)).rejects.toThrow('保存失敗');
  expect(vault.GetThinks()).toEqual([child]);
  child.Content += '未保存のメモ';
  await expect(ensureSubtaskChat(vault, child.ID)).rejects.toThrow('編集を保存');
  expect(storage.save).toHaveBeenCalledTimes(1);
});

it('does not overwrite an edit made while linking is in flight', async () => {
  let finish!: (value: object) => void;
  storage.save.mockResolvedValueOnce({}).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const work = ensureSubtaskChat(vault, child.ID);
  await vi.waitFor(() => expect(finish).toBeDefined());
  child.Content += '編集中';
  const edited = child.Content;
  finish({});
  await expect(work).rejects.toThrow('編集中の内容は保持');
  expect(child.Content).toBe(edited);
});

it('rejects a missing task or invalid relation without creating records', async () => {
  await expect(ensureSubtaskChat(vault, 'missing')).rejects.toThrow('見つかりません');
  child.Metadata.taskRelation.schemaVersion = 2; child.markMetadataSaved();
  await expect(ensureSubtaskChat(vault, 'child')).rejects.toThrow('見つかりません');
  expect(storage.save).not.toHaveBeenCalled();
});
