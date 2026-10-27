// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => ({ save: vi.fn(), getBody: vi.fn() }));
vi.mock('./storage/StorageManager', () => ({ StorageManager: { instance: storage } }));
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { startTaskFromChat } from './startTaskFromChat';
import { parseBundle } from '../utils/thinkFormat';
import { bindChatToTask } from './chatTask';
import { disposeVaultDrafts, draftVaultLease, resetDraftStores } from './draftStore';
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
afterEach(() => resetDraftStores());

it.each(['body', 'rename', 'bundle'] as const)('stops old-Vault updates and subsequent writes after reset during %s', async phase => {
  let resolve!: (value: string | { updatedAt: string }) => void;
  const wait = () => new Promise<string | { updatedAt: string }>(r => { resolve = r; });
  if (phase === 'body') { chat.IsMetaOnly = true; storage.getBody.mockImplementationOnce(wait); }
  else if (phase === 'rename') storage.save.mockImplementationOnce(wait);
  else storage.save.mockResolvedValueOnce({ updatedAt: '2026-09-20T02:00:00Z' }).mockImplementationOnce(wait);
  const lifetime = draftVaultLease(vault);
  const pending = startTaskFromChat(vault, chat.ID, '課題', undefined, lifetime.isCurrent);
  await Promise.resolve();
  const before = { content: chat.Content, metadata: structuredClone(chat.Metadata), version: chat.UpdatedAt };
  const writes = storage.save.mock.calls.length, notify = vi.spyOn(vault, 'NotifyUpdated');
  disposeVaultDrafts(vault);
  const rejected = expect(pending).rejects.toThrow('処理期間');
  resolve(phase === 'body' ? '本文' : { updatedAt: '2026-09-20T03:00:00Z' }); await rejected;
  expect(chat.Content).toBe(before.content); expect(chat.Metadata).toEqual(before.metadata); expect(chat.UpdatedAt).toBe(before.version);
  expect(storage.save).toHaveBeenCalledTimes(writes); expect(notify).not.toHaveBeenCalled(); expect(vault.GetBundles()).toHaveLength(0);
});
it('does not apply a saved task association to a Chat after its lifetime ends', async () => {
  const bundle = new TTThink(); bundle.ID = 'task'; bundle.ContentType = 'project'; vault.AddThink(bundle);
  let resolve!: (value: { updatedAt: string }) => void;
  storage.save.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const lifetime = draftVaultLease(vault), before = chat.Content, notify = vi.spyOn(vault, 'NotifyUpdated');
  const pending = bindChatToTask(vault, chat, bundle, lifetime.isCurrent);
  disposeVaultDrafts(vault);
  const rejected = expect(pending).rejects.toThrow('処理期間');
  resolve({ updatedAt: '2026-09-20T03:00:00Z' }); await rejected;
  expect(chat.Content).toBe(before); expect(chat.Metadata.taskContext).toBeUndefined(); expect(notify).not.toHaveBeenCalled();
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
    thinkid: chat.ID, fullContent: chat.Content.replace('TASK:', 'ASK:'), metadata: expect.objectContaining({ thinkConversations: chat.Metadata.thinkConversations }), baseUpdatedAt: '2026-09-20T01:00:00Z',
  }));
  expect(storage.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ thinkid: bundle.ID }));
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
  expect(storage.save.mock.calls.filter(([payload]) => payload.category === 'chat')).toHaveLength(2);
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
  expect(storage.save.mock.calls.filter(([p]) => p.category === 'project')).toHaveLength(1);
  await startTaskFromChat(reloaded, chat.ID, 'もう一度');
  expect(storage.save.mock.calls.filter(([p]) => p.category === 'project')).toHaveLength(1);
});
it('coalesces simultaneous task creation requests', async () => {
  const [a, b] = await Promise.all([startTaskFromChat(vault, chat.ID, '課題'), startTaskFromChat(vault, chat.ID, '課題')]);
  expect(a.ID).toBe(b.ID); expect(vault.GetBundles()).toHaveLength(1);
});
it.each(['saved', 'failed'] as const)('waits for an expired %s creation before coalescing new-lifetime retries', async outcome => {
  let finish!: (value: { updatedAt: string }) => void;
  let fail!: (error: Error) => void;
  let started!: () => void;
  const bundleStarted = new Promise<void>(resolve => { started = resolve; });
  storage.save.mockResolvedValueOnce({ updatedAt: '2026-09-20T02:00:00Z' })
    .mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; started(); }));
  const oldLifetime = draftVaultLease(vault);
  const oldRequest = startTaskFromChat(vault, chat.ID, '課題', undefined, oldLifetime.isCurrent);
  const oldRejected = expect(oldRequest).rejects.toThrow('Bundleを作成できませんでした');
  await bundleStarted;
  const optimistic = vault.GetBundles()[0];
  expect(optimistic).toBeTruthy();
  disposeVaultDrafts(vault);
  const lifetime = draftVaultLease(vault);
  const first = startTaskFromChat(vault, chat.ID, '課題', undefined, lifetime.isCurrent);
  const second = startTaskFromChat(vault, chat.ID, '課題', undefined, lifetime.isCurrent);
  expect(storage.save).toHaveBeenCalledTimes(2);
  if (outcome === 'saved') finish({ updatedAt: '2026-09-20T03:00:00Z' });
  else fail(new Error('old persistence failed'));
  await oldRejected;
  const [created, coalesced] = await Promise.all([first, second]);
  expect(created).toBe(coalesced);
  expect(created).not.toBe(optimistic);
  expect(vault.GetThink(created.ID)).toBe(created);
  expect(vault.GetBundles()).toEqual([created]);
  expect(chat.Metadata.taskContext.bundleId).toBe(created.ID);
  const bindings = storage.save.mock.calls.map(([payload]) => payload.metadata?.taskContext?.bundleId).filter(Boolean);
  expect(bindings).toEqual([created.ID]);
  expect(storage.save.mock.calls.filter(([payload]) => payload.category === 'project')).toHaveLength(2);
});
it('rechecks a waiting lifetime and lets a later active lifetime retry safely', async () => {
  let finish!: (value: { updatedAt: string }) => void;
  let started!: () => void;
  const bundleStarted = new Promise<void>(resolve => { started = resolve; });
  storage.save.mockResolvedValueOnce({ updatedAt: '2026-09-20T02:00:00Z' })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; started(); }));
  const oldLifetime = draftVaultLease(vault);
  const oldRequest = startTaskFromChat(vault, chat.ID, '課題', undefined, oldLifetime.isCurrent);
  const oldRejected = expect(oldRequest).rejects.toThrow('処理期間');
  await bundleStarted;
  disposeVaultDrafts(vault);
  const waitingLifetime = draftVaultLease(vault);
  const waiting = startTaskFromChat(vault, chat.ID, '失効した新要求', undefined, waitingLifetime.isCurrent);
  const waitingRejected = expect(waiting).rejects.toThrow('処理期間');
  disposeVaultDrafts(vault);
  const latestLifetime = draftVaultLease(vault);
  const latest = startTaskFromChat(vault, chat.ID, '課題', undefined, latestLifetime.isCurrent);
  expect(storage.save).toHaveBeenCalledTimes(2);
  finish({ updatedAt: '2026-09-20T03:00:00Z' });
  await oldRejected; await waitingRejected;
  const created = await latest;
  expect(vault.GetBundles()).toEqual([created]);
  expect(chat.Metadata.taskContext.bundleId).toBe(created.ID);
  expect(storage.save.mock.calls.some(([payload]) => payload.fullContent.includes('失効した新要求'))).toBe(false);
});
it('retains the legacy kind when explicitly starting a legacy Chat as a task', async () => {
  chat.setContentSilent(chat.Content.replace('ASK:', 'LOOP:')); chat.markSaved();
  const bundle = await startTaskFromChat(vault, chat.ID, '定例読書会');
  expect(chat.Name).toBe('TASK:Thinktank｜[進行中]定例読書会');
  expect(chat.Metadata.taskContext).toMatchObject({ bundleId: bundle.ID, previousKind: 'LOOP' });
  await startTaskFromChat(vault, chat.ID, '定例読書会');
  expect(chat.Metadata.taskContext.previousKind).toBe('LOOP');
});
