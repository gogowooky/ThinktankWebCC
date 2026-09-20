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
  expect(chat.Content).toBe('# ASK:Thinktank｜[進行中]誕生日会\n## 質問\n回答\n');
  expect(chat.IsDirty).toBe(false);
  expect(storage.save).toHaveBeenNthCalledWith(1, expect.objectContaining({
    id: chat.ID, fullContent: chat.Content, metadata: chat.Metadata, baseUpdatedAt: '2026-09-20T01:00:00Z',
  }));
  expect(storage.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: bundle.ID }));
});

it('loads a metadata-only Chat without losing the saved conversation', async () => {
  chat.setContentSilent('ASK:Thinktank｜新しい相談'); chat.markSaved(); chat.IsMetaOnly = true;
  storage.getBody.mockResolvedValue('## 質問\n回答');
  await startTaskFromChat(vault, chat.ID, '課題');
  expect(chat.Content).toBe('ASK:Thinktank｜課題\n## 質問\n回答');
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
  expect(storage.save.mock.calls.filter(([payload]) => payload.contentType === 'chat')).toHaveLength(1);
});

it('refuses missing bodies and invalid task titles before writing', async () => {
  await expect(startTaskFromChat(vault, chat.ID, ' '.repeat(5))).rejects.toThrow('課題名');
  chat.IsMetaOnly = true; storage.getBody.mockResolvedValue(null);
  await expect(startTaskFromChat(vault, chat.ID, '課題')).rejects.toThrow('本文');
  expect(storage.save).not.toHaveBeenCalled();
});
