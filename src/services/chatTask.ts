import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';
import { parseManagedChatTitle } from '../utils/managedChat';
import { StorageManager } from './storage/StorageManager';

function field(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return;
  const result = (value as Record<string, unknown>)[key];
  return typeof result === 'string' && result ? result : undefined;
}
export interface ChatTask { bundle?: TTThink; candidates: TTThink[]; error?: string }
/** Titles are editable labels; only stored IDs can establish a context relationship. */
export function resolveChatTask(vault: TTVault, chat?: TTThink): ChatTask {
  if (!chat) return { candidates: [] };
  const ids = [...new Set([field(chat.Metadata.taskContext, 'bundleId'), field(chat.Metadata.subtaskChat, 'bundleId'),
    field(chat.Metadata.thoughtSupport, 'bundleId')].filter((id): id is string => !!id))];
  if (ids.length > 1) return { candidates: [], error: '課題との関連付けが競合しています。関連情報を確認してください。' };
  if (ids.length === 1) {
    const bundle = vault.GetThink(ids[0]);
    return bundle?.ContentType === 'bundle' ? { bundle, candidates: [bundle] }
      : { candidates: [], error: '対応する課題を読み込めません。Vaultを再読み込みしてください。' };
  }
  const bundles = vault.GetBundles();
  const origins = bundles.filter(b => field(b.Metadata.taskOrigin, 'chatId') === chat.ID);
  const candidates = origins.length ? origins : bundles.filter(b => b.RelatedIDs.split(',').includes(chat.ID)
    || (!b.IsMetaOnly && b.getThinkIds().includes(chat.ID)));
  if (candidates.length === 1) return { bundle: candidates[0], candidates };
  if (candidates.length > 1) return { candidates, error: 'この相談を含む課題が複数あります。相談の対象を選んでください。' };
  return { candidates, ...(parseManagedChatTitle(chat.Name)?.kind === 'TASK'
    ? { error: 'TASKの対応課題が見つかりません。関連付けを確認してください。' } : {}) };
}

export async function bindChatToTask(vault: TTVault, chat: TTThink, bundle: TTThink) {
  if (chat.IsDirty || chat.IsMetadataDirty) throw new Error('Chatの編集を保存してから関連付けてください。');
  const before = chat.Content, version = chat.UpdatedAt, metadataBefore = JSON.stringify(chat.Metadata);
  let content = before;
  if (chat.IsMetaOnly) {
    const body = await StorageManager.instance.getBody(chat.ID);
    if (body === null) throw new Error('Chat本文を読み込めません。');
    content = `${chat.TitleLine}\n${body}`;
  }
  const current = () => vault.GetThink(chat.ID) === chat && chat.Content === before && chat.UpdatedAt === version
    && JSON.stringify(chat.Metadata) === metadataBefore && !chat.IsDirty && !chat.IsMetadataDirty;
  if (!current()) throw new Error('Chatが変更されました。再確認してください。');
  const parsed = parseManagedChatTitle(chat.Name);
  const heading = /^(\s*#{1,6}\s+)/.exec(chat.TitleLine)?.[1] ?? '';
  const state = parsed && parsed.state !== '状態未設定' ? `[${parsed.state}]` : '';
  const fullContent = content.replace(/^[^\r\n]*/, () => `${heading}TASK:${parsed?.panel ?? 'Thinktank'}｜${state}${parsed?.title ?? chat.Name}`);
  const previousKind = field(chat.Metadata.taskContext, 'previousKind')
    ?? (parsed && !['ASK', 'TASK'].includes(parsed.kind) ? parsed.kind : undefined);
  const metadata = { ...chat.Metadata, taskContext: { schemaVersion: 1, bundleId: bundle.ID,
    ...(previousKind ? { previousKind } : {}) } };
  if (fullContent === before && JSON.stringify(metadata) === metadataBefore) return;
  const saved = await StorageManager.instance.save({ id: chat.ID, contentType: 'chat', fullContent, metadata,
    keywords: chat.Keywords, relatedIds: chat.RelatedIDs, baseUpdatedAt: version || undefined });
  if (!current()) throw new Error('関連付けは保存されました。編集中の内容を確認してから再読み込みしてください。');
  chat.setContentSilent(fullContent); chat.Metadata = metadata; chat.IsMetaOnly = false;
  if (saved.updatedAt) chat.UpdatedAt = saved.updatedAt;
  chat.markSaved(); chat.markMetadataSaved(); vault.NotifyUpdated(false);
}
