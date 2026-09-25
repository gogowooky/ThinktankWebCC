import type { TTVault } from '../models/TTVault';
import type { TTThink } from '../models/TTThink';
import { StorageManager } from './storage/StorageManager';
import { readTaskRelation } from './taskRelation';
import { parseBundle } from '../utils/thinkFormat';

export function readSubtaskChat(value: unknown): { schemaVersion: 1; bundleId: string } | undefined {
  if (!value || typeof value !== 'object') return;
  const record = value as { schemaVersion?: unknown; bundleId?: unknown };
  if (record.schemaVersion === 1 && typeof record.bundleId === 'string' && /^[\w-]{1,200}$/.test(record.bundleId)) {
    return { schemaVersion: 1, bundleId: record.bundleId };
  }
}

const pending = new WeakMap<TTVault, Map<string, Promise<TTThink>>>();
/** Save ownership with the Chat, so retrying a failed Bundle link reuses that Chat. */
export async function ensureSubtaskChat(vault: TTVault, bundleId: string): Promise<TTThink> {
  let requests = pending.get(vault);
  if (!requests) { requests = new Map(); pending.set(vault, requests); }
  const running = requests.get(bundleId);
  if (running) return running;
  const work = prepare(vault, bundleId);
  requests.set(bundleId, work);
  try { return await work; } finally { requests.delete(bundleId); }
}

async function prepare(vault: TTVault, bundleId: string): Promise<TTThink> {
  const bundle = vault.GetThink(bundleId);
  if (bundle?.ContentType !== 'bundle' || !readTaskRelation(bundle.Metadata.taskRelation)) {
    throw new Error('サブ課題が見つかりません。');
  }
  if (bundle.IsMetaOnly) await bundle.LoadContent();
  if (bundle.IsMetaOnly || bundle.IsDirty || bundle.IsMetadataDirty) {
    throw new Error('サブ課題の編集を保存し、本文を読み込んでからもう一度お試しください。');
  }
  const matches = vault.GetThinks().filter(t => t.ContentType === 'chat' && readSubtaskChat(t.Metadata.subtaskChat)?.bundleId === bundleId);
  if (matches.length > 1) throw new Error('専用Chatが複数あります。関連付けを確認してください。');
  const chat = matches[0] ?? await vault.CreateBlankThink('chat', `TASK:Workout｜${bundle.Name}`, undefined,
    { subtaskChat: { schemaVersion: 1, bundleId } });

  // Preserve every existing line, including comments and unknown extensions.
  if (vault.GetThink(bundleId) !== bundle || bundle.IsDirty || bundle.IsMetadataDirty) {
    throw new Error('サブ課題が変更されました。保存済みChatを再利用できるので、編集を保存して再試行してください。');
  }
  const ids = parseBundle(bundle.Content).ids;
  if (ids.includes(chat.ID)) return chat;
  const before = bundle.Content;
  const metadata = structuredClone(bundle.Metadata);
  const content = `${before}${before.endsWith('\n') ? '' : '\n'}* ${chat.ID}\n`;
  const result = await StorageManager.instance.save({
    id: bundleId, contentType: 'bundle', fullContent: content, keywords: bundle.Keywords,
    relatedIds: [...ids, chat.ID].join(','), metadata, baseUpdatedAt: bundle.UpdatedAt || undefined,
  });
  if (vault.GetThink(bundleId) !== bundle || bundle.Content !== before || bundle.IsMetadataDirty) {
    throw new Error('Chatの関連付けは保存されましたが、編集中の内容は保持しています。サブ課題を再読み込みしてください。');
  }
  bundle.setContentSilent(content);
  bundle.RelatedIDs = [...ids, chat.ID].join(',');
  if (result.updatedAt) bundle.UpdatedAt = result.updatedAt;
  bundle.markSaved();
  vault.NotifyUpdated(false);
  return chat;
}
