import type { TTVault } from '../models/TTVault';
import { StorageManager } from './storage/StorageManager';
import type { TaskSeed } from './taskSeed';
import { parseManagedChatTitle } from '../utils/managedChat';
import { emptyThinkValues, readThinkSupport } from '../../server/services/thinkSupportRecord';
import { bindChatToTask, resolveChatTask } from './chatTask';

const pending = new WeakMap<TTVault, Map<string, Promise<import('../models/TTThink').TTThink>>>();

/** Rename the source consultation before creating its task, preserving routing and history. */
export async function startTaskFromChat(vault: TTVault, chatId: string, title: string, seed?: TaskSeed) {
  let requests = pending.get(vault);
  if (!requests) { requests = new Map(); pending.set(vault, requests); }
  const running = requests.get(chatId);
  if (running) return running;
  const work = create(vault, chatId, title, seed);
  requests.set(chatId, work);
  try { return await work; } finally { requests.delete(chatId); }
}
async function create(vault: TTVault, chatId: string, title: string, seed?: TaskSeed) {
  const normalizedTitle = title.replace(/[\r\n]+/g, ' ').trim();
  if (!normalizedTitle) throw new Error('課題名を入力してください。');
  if (normalizedTitle.length > 200) throw new Error('課題名は200文字以内で入力してください。');
  const now = new Date().toISOString();
  if (seed) readThinkSupport({ schemaVersion: 1, revision: 1, author: 'human', confirmedAt: now, updatedAt: now,
    values: { ...emptyThinkValues(), ...seed }, sources: {} });
  const chat = vault.GetThink(chatId);
  if (chat?.ContentType !== 'chat') throw new Error('起点のChatが見つかりません。');
  if (chat.IsDirty || chat.IsMetadataDirty) throw new Error('Chatの編集を保存してから課題を作成してください。');
  const association = resolveChatTask(vault, chat);
  if (association.error) throw new Error(association.error);
  if (association.bundle) {
    await bindChatToTask(vault, chat, association.bundle);
    return association.bundle;
  }
  const before = chat.Content;
  const version = chat.UpdatedAt;
  const metadata = structuredClone(chat.Metadata);
  const isCurrent = () => vault.GetThink(chatId) === chat && chat.Content === before
    && chat.UpdatedAt === version && !chat.IsMetadataDirty;
  let content = before;
  if (chat.IsMetaOnly) {
    const body = await StorageManager.instance.getBody(chatId);
    if (body === null) throw new Error('起点のChat本文が見つかりません。再読み込みしてください。');
    content = `${chat.TitleLine}\n${body}`;
  }
  if (!isCurrent()) throw new Error('Chatが変更されました。再確認してください。');
  const managed = parseManagedChatTitle(chat.Name);
  const heading = /^(\s*#{1,6}\s+)/.exec(chat.TitleLine)?.[1] ?? '';
  const prefix = managed ? `${managed.kind}:${managed.panel}｜${managed.state === '状態未設定' ? '' : `[${managed.state}]`}` : '';
  const renamed = content.replace(/^[^\r\n]*/, () => `${heading}${prefix}${normalizedTitle}`);
  if (renamed !== content) {
    const saved = await StorageManager.instance.save({
      id: chatId, contentType: 'chat', fullContent: renamed, keywords: chat.Keywords,
      relatedIds: chat.RelatedIDs, metadata, baseUpdatedAt: version || undefined,
    });
    if (!isCurrent()) throw new Error('Chatの題名は保存されましたが、編集中の変更があります。再読み込みしてから課題を作成してください。');
    chat.setContentSilent(renamed);
    chat.IsMetaOnly = false;
    if (saved.updatedAt) chat.UpdatedAt = saved.updatedAt;
    chat.markSaved();
    vault.NotifyUpdated(false);
  }
  let bundle;
  try {
    bundle = await vault.CreateTaskBundle(normalizedTitle, [chatId], seed, chatId);
  } catch (error) {
    throw Object.assign(new Error(`Bundleを作成できませんでした。Chatの題名は「${normalizedTitle}」です。再試行してください。${error instanceof Error ? error.message : ''}`), { cause: error });
  }
  try { await bindChatToTask(vault, chat, bundle); }
  catch (error) { throw Object.assign(new Error(`課題は作成済みですがChatの関連付けを保存できませんでした。再試行で同じ課題を再利用します。${error instanceof Error ? error.message : ''}`), { cause: error }); }
  return bundle;
}
