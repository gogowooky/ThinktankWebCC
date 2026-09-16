// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue({ updatedAt: '2026-09-13T00:00:00Z' }), search: vi.fn().mockResolvedValue([]) }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../services/ChatApiService', () => { throw new Error('Core operations must not import AI execution'); });
import { TTVault } from './TTVault';
import { TTOverviewPanel } from '../views/TTOverviewPanel';
import { parseBundle } from '../utils/thinkFormat';
import { readThinkSupport } from '../../server/services/thinkSupportRecord';
import type { ConversationTurn } from '../services/ConversationService';

it('creates and edits Thinks, resolves a Bundle and opens Overview without AI', async () => {
  const vault = new TTVault();
  const think = await vault.CreateBlankThink('memo', '資料');
  think.Content = '資料\nAIなしで編集した本文';
  await think.SaveContent();
  expect(think.IsDirty).toBe(false);
  const bundle = await vault.CreateBundleFromIds([think.ID]);
  expect(vault.GetBundles()).toContain(bundle);
  expect((await vault.GetThinksForBundleAsync(bundle.ID, true)).map(t => t.ID)).toEqual([think.ID]);
  const overview = new TTOverviewPanel();
  overview.OpenBundle(bundle.ID);
  expect(overview.BundleID).toBe(bundle.ID);
  expect(overview.MediaType).toBe('datagrid');
  expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ id: think.ID, fullContent: think.Content }));
});

it('saves confirmed task details together with the Bundle and preserves the Chat', async () => {
  const vault = new TTVault();
  const chat = await vault.CreateBlankThink('chat', '相談\n会話はここに残す');
  const seed = { goal: '誕生日を祝う', completionCriteria: '会を終えて片付ける' };
  storage.save.mockClear();
  const bundle = await vault.CreateTaskBundle('誕生日会', [chat.ID], seed);
  expect(storage.save).toHaveBeenCalledTimes(1);
  expect(storage.save).toHaveBeenCalledWith(expect.objectContaining({ metadata: { thinkSupport: expect.objectContaining({
    values: expect.objectContaining(seed), author: 'human', revision: 1,
  }) } }));
  expect(readThinkSupport(bundle.Metadata.thinkSupport)?.values).toMatchObject(seed);
  expect(bundle.IsMetadataDirty).toBe(false);
  expect(chat.Content).toBe('相談\n会話はここに残す');
});

it('does not leave an in-memory task when the combined save fails', async () => {
  const vault = new TTVault();
  storage.save.mockRejectedValueOnce(new Error('保存失敗'));
  await expect(vault.CreateTaskBundle('誕生日会', [], { goal: '祝う', completionCriteria: '開催する' })).rejects.toThrow('保存失敗');
  expect(vault.GetBundles()).toHaveLength(0);
});

it('creates a related subtask once for simultaneous adoption and after reloading its metadata', async () => {
  const vault = new TTVault('vault');
  const chat = await vault.CreateBlankThink('chat', '相談');
  const parent = await vault.CreateTaskBundle('誕生日会', [chat.ID]);
  const turn = { id: 'turn-1', context: { scope: 'bundle-only', vaultId: vault.ID, bundleId: parent.ID },
    answer: { proposals: [{ field: 'nextAction', after: '会場を予約する' }] } } as ConversationTurn;
  storage.save.mockClear();
  const [first, second] = await Promise.all([
    vault.CreateSubtaskFromConversation(turn, chat.ID, '会場の予約'),
    vault.CreateSubtaskFromConversation(turn, chat.ID, '会場の予約'),
  ]);
  expect(first.ID).toBe(second.ID);
  expect(storage.save).toHaveBeenCalledTimes(1);
  expect(first.Metadata.taskRelation).toEqual({ schemaVersion: 1, parentId: parent.ID, chatId: chat.ID, turnId: turn.id, panel: 'Workout' });
  expect(readThinkSupport(first.Metadata.thinkSupport)?.values.goal).toBe('会場を予約する');
  expect(parseBundle(first.Content).ids).toEqual([chat.ID]);
  const reloaded = new TTVault('vault');
  reloaded.AddThink(parent); reloaded.AddThink(chat); reloaded.AddThink(first);
  expect((await reloaded.CreateSubtaskFromConversation(turn, chat.ID, '別名')).ID).toBe(first.ID);
  expect(storage.save).toHaveBeenCalledTimes(1);
  await expect(vault.CreateSubtaskFromConversation({ ...turn, context: { ...turn.context, vaultId: 'other' } }, chat.ID, '不正')).rejects.toThrow('対象');
});

it('creates one task Bundle with the confirmed title and links the consultation Chat', async () => {
  const vault = new TTVault();
  const chat = await vault.CreateBlankThink('chat', 'TODO:Thinktank｜[進行中]誕生日会を開催する');
  const bundle = await vault.CreateTaskBundle('  誕生日会を開催する\n', [chat.ID, chat.ID, 'missing']);

  expect(bundle.Name).toBe('誕生日会を開催する');
  expect(parseBundle(bundle.Content).ids).toEqual([chat.ID]);
  expect((await vault.GetThinksForBundleAsync(bundle.ID, true)).map(t => t.ID)).toEqual([chat.ID]);
  expect(storage.save).toHaveBeenLastCalledWith(expect.objectContaining({
    id: bundle.ID,
    contentType: 'bundle',
    relatedIds: chat.ID,
  }));
});
