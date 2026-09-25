// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock('./apiClient', () => ({ apiFetch: mocks.fetch }));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: { save: mocks.save } } }));
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { ConversationClient } from './ConversationService';
import { startTaskFromChat } from './startTaskFromChat';

let vault: TTVault, chat: TTThink;
const savedChat = { id: 'chat', title: '# ASK:Thinktank｜相談', content: '保存済みの会話',
  updatedAt: '2026-09-25T02:00:00Z', keywords: '資料', relatedIds: 'source',
  metadata: { keep: true, thinkConversations: { schemaVersion: 1, turns: [] } } };
function response() { return new Response(JSON.stringify({ schemaVersion: 1, turns: [], savedChat })); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.fetch.mockResolvedValue(response());
  mocks.save.mockResolvedValue({ updatedAt: '2026-09-25T03:00:00Z' });
  vault = new TTVault('vault'); chat = new TTThink(); chat.ID = 'chat'; chat.ContentType = 'chat';
  chat.Content = '# ASK:Thinktank｜相談'; chat.IsMetaOnly = true;
  chat.UpdatedAt = '2026-09-25T01:00:00Z'; chat.markSaved(); chat.markMetadataSaved(); vault.AddThink(chat);
});
const read = () => new ConversationClient().history(undefined, undefined, 'chat', 'vault', vault);

it('creates a task after refreshing saved conversation content, metadata and version together', async () => {
  await read();
  expect(chat.IsDirty).toBe(false); expect(chat.IsMetadataDirty).toBe(false);
  expect(chat.IsMetaOnly).toBe(false); expect(chat.Metadata).toEqual(savedChat.metadata);
  const bundle = await startTaskFromChat(vault, 'chat', '教材課題');
  expect(bundle.ContentType).toBe('bundle');
  expect(mocks.save).toHaveBeenNthCalledWith(1, expect.objectContaining({
    baseUpdatedAt: savedChat.updatedAt, fullContent: '# ASK:Thinktank｜教材課題\n保存済みの会話',
    metadata: savedChat.metadata, keywords: '資料', relatedIds: 'source',
  }));
});
it.each(['before', 'during'])('preserves manual content edits made %s the history request', async timing => {
  let resolve!: (value: Response) => void;
  mocks.fetch.mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  if (timing === 'before') chat.Content += '\n手動編集';
  const pending = read();
  if (timing === 'during') chat.Content += '\n手動編集';
  resolve(response()); await pending;
  expect(chat.Content).toContain('手動編集'); expect(chat.IsDirty).toBe(true);
  expect(chat.UpdatedAt).toBe('2026-09-25T01:00:00Z');
  await expect(startTaskFromChat(vault, 'chat', '課題')).rejects.toThrow('編集を保存');
  expect(mocks.save).not.toHaveBeenCalled();
});
it('preserves unsaved metadata and ignores an older server record', async () => {
  chat.Metadata = { local: true }; await read();
  expect(chat.Metadata).toEqual({ local: true }); expect(chat.IsMetadataDirty).toBe(true);
  chat.markMetadataSaved(); chat.UpdatedAt = '2026-09-25T04:00:00Z';
  mocks.fetch.mockResolvedValue(response()); await read();
  expect(chat.Metadata).toEqual({ local: true }); expect(chat.IsMetaOnly).toBe(true);
});
