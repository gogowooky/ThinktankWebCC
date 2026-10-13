import type { TTVault } from '../models/TTVault';
import { StorageManager } from './storage/StorageManager';
import type { TaskSeed } from './taskSeed';
import { parseManagedChatTitle } from '../utils/managedChat';
import { emptyThinkValues, readThinkSupport } from '../../server/contracts/thinkSupportRecord';
import { bindChatToTask, resolveChatTask } from './chatTask';
import type { TTThink } from '../models/TTThink';

const pending = new WeakMap<TTVault, Map<string, { promise: Promise<TTThink>; isCurrent: () => boolean }>>();

/** Rename the source consultation before creating its task, preserving routing and history. */
export async function startTaskFromChat(vault: TTVault, chatId: string, title: string, seed?: TaskSeed, isCurrent: () => boolean = () => true): Promise<TTThink> {
  assertCurrent(isCurrent);
  let requests = pending.get(vault);
  if (!requests) { requests = new Map(); pending.set(vault, requests); }
  const running = requests.get(chatId);
  if (running) {
    if (running.isCurrent()) return running.promise;
    // 旧保存の楽観Bundleを既存課題と誤認しないよう、登録の確定/巻戻しを待って再解決する。
    try { await running.promise; } catch { /* 旧寿命の失敗は、新しい要求の失敗とは分ける。 */ }
    assertCurrent(isCurrent);
    return startTaskFromChat(vault, chatId, title, seed, isCurrent);
  }
  const work = { promise: create(vault, chatId, title, seed, isCurrent), isCurrent };
  requests.set(chatId, work);
  try { return await work.promise; } finally { if (requests.get(chatId) === work) requests.delete(chatId); }
}
function assertCurrent(isCurrent: () => boolean): void {
  if (!isCurrent()) throw new Error('アプリの処理期間が終了しました。');
}
async function create(vault: TTVault, chatId: string, title: string, seed: TaskSeed | undefined, lifetimeCurrent: () => boolean) {
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
    await bindChatToTask(vault, chat, association.bundle, lifetimeCurrent);
    assertCurrent(lifetimeCurrent);
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
    assertCurrent(lifetimeCurrent);
    if (body === null) throw new Error('起点のChat本文が見つかりません。再読み込みしてください。');
    content = `${chat.TitleLine}\n${body}`;
  }
  if (!isCurrent()) throw new Error('Chatが変更されました。再確認してください。');
  assertCurrent(lifetimeCurrent);
  const managed = parseManagedChatTitle(chat.Name);
  const heading = /^(\s*#{1,6}\s+)/.exec(chat.TitleLine)?.[1] ?? '';
  const prefix = managed ? `${managed.kind}:${managed.panel}｜${managed.state === '状態未設定' ? '' : `[${managed.state}]`}` : '';
  const renamed = content.replace(/^[^\r\n]*/, () => `${heading}${prefix}${normalizedTitle}`);
  if (renamed !== content) {
    const saved = await StorageManager.instance.save({
      thinkid: chatId, category: 'chat', fullContent: renamed, keywords: chat.Keywords,
      relatedIds: chat.RelatedIDs, metadata, baseUpdatedAt: version || undefined,
    });
    assertCurrent(lifetimeCurrent);
    if (!isCurrent()) throw new Error('Chatの題名は保存されましたが、編集中の変更があります。再読み込みしてから課題を作成してください。');
    chat.setContentSilent(renamed);
    chat.IsMetaOnly = false;
    if (saved.updatedAt) chat.UpdatedAt = saved.updatedAt;
    chat.markSaved();
    vault.NotifyUpdated(false);
  }
  let bundle;
  try {
    assertCurrent(lifetimeCurrent);
    bundle = await vault.CreateTaskBundle(normalizedTitle, [chatId], seed, chatId, lifetimeCurrent);
    assertCurrent(lifetimeCurrent);
  } catch (error) {
    throw Object.assign(new Error(`Bundleを作成できませんでした。Chatの題名は「${normalizedTitle}」です。再試行してください。${error instanceof Error ? error.message : ''}`), { cause: error });
  }
  try { assertCurrent(lifetimeCurrent); await bindChatToTask(vault, chat, bundle, lifetimeCurrent); assertCurrent(lifetimeCurrent); }
  catch (error) { throw Object.assign(new Error(`課題は作成済みですがChatの関連付けを保存できませんでした。再試行で同じ課題を再利用します。${error instanceof Error ? error.message : ''}`), { cause: error }); }
  return bundle;
}
