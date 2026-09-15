// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue({ updatedAt: '2026-09-13T00:00:00Z' }), search: vi.fn().mockResolvedValue([]) }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
vi.mock('../services/ChatApiService', () => { throw new Error('Core operations must not import AI execution'); });
import { TTVault } from './TTVault';
import { TTOverviewPanel } from '../views/TTOverviewPanel';
import { parseBundle } from '../utils/thinkFormat';

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
