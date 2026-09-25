// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ save: vi.fn(), getBody: vi.fn() }));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { startTaskFromChat } from './startTaskFromChat';
import { parseBundle } from '../utils/thinkFormat';
let vault: TTVault, chat: TTThink;
beforeEach(() => {
  storage.save.mockReset().mockResolvedValue({ updatedAt: '2026-09-20T02:00:00Z' });
  storage.getBody.mockReset();
  vault = new TTVault('vault'); chat = new TTThink(); chat.ID = '2026-09-20-100000'; chat.ContentType = 'chat';
  chat.Content = '# ASK:Thinktank｜[進行中]新しい相談\n## 質問\n回答\n';
  chat.Metadata = { thinkConversations: { turns: [{ id: 'turn' }] } };
  chat.UpdatedAt = '2026-09-20T01:00:00Z';
  chat.markSaved(); chat.markMetadataSaved(); vault.AddThink(chat);
});

it('renames the consultation while preserving its panel, state, transcript and metadata', async () => {
  const seed = { goal: '祝う', completionCriteria: '開催する' };
  const bundle = await startTaskFromChat(vault, chat.ID, '  誕生日会\n', seed);
  expect(bundle.Name).toBe('誕生日会');
  expect(parseBundle(bundle.Content).ids).toEqual([chat.ID]);
  expect(bundle.Metadata.thinkSupport.values).toMatchObject(seed);
  expect(chat.Content).toBe('# TASK:Thinktank｜[進行中]誕生日会\n## 質問\n回答\n');
  expect(chat.IsDirty).toBe(false);
  expect(chat.Metadata.taskContext.bundleId).toBe(bundle.ID);
  expect(bundle.Metadata.taskOrigin.chatId).toBe(chat.ID);
  expect(chat.IsMetadataDirty).toBe(false);
  expect(storage.save).toHaveBeenNthCalledWith(1, expect.objectContaining({
    id: chat.ID, fullContent: chat.Content.replace('TASK:', 'ASK:'), metadata: expect.objectContaining({ thinkConversations: chat.Metadata.thinkConversations }), baseUpdatedAt: '2026-09-20T01:00:00Z',
  }));
  expect(storage.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: bundle.ID }));
});

it('loads a metadata-only Chat without losing the saved conversation', async () => {
  chat.setContentSilent('ASK:Thinktank｜新しい相談'); chat.markSaved(); chat.IsMetaOnly = true;
  storage.getBody.mockResolvedValue('## 質問\n回答');
  await startTaskFromChat(vault, chat.ID, '課題');
  expect(chat.Content).toBe('TASK:Thinktank｜課題\n## 質問\n回答');
  expect(chat.IsMetaOnly).toBe(false);
});

it('does not create a Bundle or change the local Chat when rename storage fails', async () => {
  const before = chat.Content;
  storage.save.mockRejectedValueOnce(new Error('保存競合'));
  await expect(startTaskFromChat(vault, chat.ID, '課題')).rejects.toThrow('保存競合');
  expect(chat.Content).toBe(before);
  expect(vault.GetBundles()).toHaveLength(0);
});

it('preserves the renamed Chat on Bundle failure and permits retry', async () => {
  storage.save.mockResolvedValueOnce({ updatedAt: '2026-09-20T02:00:00Z' }).mockRejectedValueOnce(new Error('保存失敗'));
  await expect(startTaskFromChat(vault, chat.ID, '課題')).rejects.toThrow('Chatの題名は「課題」');
  expect(vault.GetBundles()).toHaveLength(0);
  const bundle = await startTaskFromChat(vault, chat.ID, '課題');
  expect(vault.GetBundles()).toEqual([bundle]);
  expect(storage.save.mock.calls.filter(([payload]) => payload.contentType === 'chat')).toHaveLength(2);
});

it('refuses missing bodies and invalid task titles before writing', async () => {
  await expect(startTaskFromChat(vault, chat.ID, ' '.repeat(5))).rejects.toThrow('課題名');
  chat.IsMetaOnly = true; storage.getBody.mockResolvedValue(null);
  await expect(startTaskFromChat(vault, chat.ID, '課題')).rejects.toThrow('本文');
  expect(storage.save).not.toHaveBeenCalled();
});
it('reuses the saved Bundle after final Chat binding fails, including after local reload', async () => {
  storage.save.mockResolvedValueOnce({ updatedAt: '2026-09-20T02:00:00Z' })
    .mockResolvedValueOnce({ updatedAt: '2026-09-20T03:00:00Z' }).mockRejectedValueOnce(new Error('一時失敗'));
  await expect(startTaskFromChat(vault, chat.ID, '課題')).rejects.toThrow('課題は作成済み');
  expect(chat.Name).toContain('ASK:');
  const bundle = vault.GetBundles()[0];
  const reloaded = new TTVault('vault'); reloaded.AddThink(chat); reloaded.AddThink(bundle);
  const result = await startTaskFromChat(reloaded, chat.ID, '課題');
  expect(result.ID).toBe(bundle.ID); expect(chat.Name).toContain('TASK:');
  expect(storage.save.mock.calls.filter(([p]) => p.contentType === 'bundle')).toHaveLength(1);
  await startTaskFromChat(reloaded, chat.ID, 'もう一度');
  expect(storage.save.mock.calls.filter(([p]) => p.contentType === 'bundle')).toHaveLength(1);
});
it('coalesces simultaneous task creation requests', async () => {
  const [a, b] = await Promise.all([startTaskFromChat(vault, chat.ID, '課題'), startTaskFromChat(vault, chat.ID, '課題')]);
  expect(a.ID).toBe(b.ID); expect(vault.GetBundles()).toHaveLength(1);
});
it('retains the legacy kind when explicitly starting a legacy Chat as a task', async () => {
  chat.setContentSilent(chat.Content.replace('ASK:', 'LOOP:')); chat.markSaved();
  const bundle = await startTaskFromChat(vault, chat.ID, '定例読書会');
  expect(chat.Name).toBe('TASK:Thinktank｜[進行中]定例読書会');
  expect(chat.Metadata.taskContext).toMatchObject({ bundleId: bundle.ID, previousKind: 'LOOP' });
  await startTaskFromChat(vault, chat.ID, '定例読書会');
  expect(chat.Metadata.taskContext.previousKind).toBe('LOOP');
});
