// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { TTThink } from '../models/TTThink';
import { TTVault } from '../models/TTVault';
import { resolveChatTask } from './chatTask';
function fixture() {
  const vault = new TTVault('vault');
  const chat = new TTThink(); chat.ID = 'chat'; chat.ContentType = 'chat'; chat.Content = 'ASK:Thinktank｜相談'; vault.AddThink(chat);
  const bundle = new TTThink(); bundle.ID = 'task'; bundle.ContentType = 'bundle'; bundle.Content = '課題'; vault.AddThink(bundle);
  return { vault, chat, bundle };
}
it('does not infer ownership from matching titles or a TASK tag', () => {
  const { vault, chat, bundle } = fixture(); bundle.Name = chat.Name;
  expect(resolveChatTask(vault, chat).bundle).toBeUndefined();
  chat.Content = 'TASK:Thinktank｜相談'; expect(resolveChatTask(vault, chat).error).toContain('見つかりません');
});
it('keeps explicit task ownership even when another Bundle also references the Chat', () => {
  const { vault, chat, bundle } = fixture(); chat.Metadata.taskContext = { schemaVersion: 1, bundleId: bundle.ID };
  const other = new TTThink(); other.ID = 'other'; other.ContentType = 'bundle'; other.Content = '資料集\n* chat'; vault.AddThink(other);
  expect(resolveChatTask(vault, chat).bundle).toBe(bundle);
  chat.Metadata.taskContext.bundleId = 'missing'; expect(resolveChatTask(vault, chat).error).toContain('読み込めません');
});
it('recovers legacy ID membership and blocks ambiguous contexts', () => {
  const { vault, chat, bundle } = fixture(); bundle.RelatedIDs = 'chat'; bundle.IsMetaOnly = true;
  expect(resolveChatTask(vault, chat).bundle).toBe(bundle);
  const other = new TTThink(); other.ID = 'other'; other.ContentType = 'bundle'; other.Content = '別課題\n* chat'; other.RelatedIDs = 'chat'; vault.AddThink(other);
  expect(resolveChatTask(vault, chat).candidates).toHaveLength(2);
  expect(resolveChatTask(vault, chat).bundle).toBeUndefined();
  expect(resolveChatTask(vault, chat).error).toContain('複数');
});
