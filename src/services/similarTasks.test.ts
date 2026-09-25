// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { findSimilarTasks } from './similarTasks';
import { chatOnlyConversationContext, type ConversationTurn } from './ConversationService';
function fixture() {
  const vault = new TTVault('vault');
  const chat = new TTThink(); chat.ID = 'chat'; chat.ContentType = 'chat'; chat.Content = 'ASK:Thinktank｜新しい相談'; vault.AddThink(chat);
  for (const [id, title, goal] of [['reading', '読書会の準備', '読書を通じて交流する'], ['travel', '旅行', '京都を巡る']]) {
    const b = new TTThink(); b.ID = id; b.ContentType = 'bundle'; b.Content = title;
    b.Metadata.thinkSupport = { values: { goal, completionCriteria: '開催結果を記録する' } }; vault.AddThink(b);
  }
  return vault;
}
function turn(question: string, vaultId = 'vault'): ConversationTurn {
  return { schemaVersion: 1, id: 'turn', question, createdAt: new Date().toISOString(),
    context: chatOnlyConversationContext(vaultId, 'chat'), provider: 'test', model: 'test',
    answer: { reply: '旅行にも行きましょう', insufficientEvidence: false, proposals: [], citations: [] } };
}
it('finds tasks from the consultation, explains matches and excludes unrelated AI suggestions', () => {
  const result = findSimilarTasks(fixture(), 'chat', [turn('4人で読書会を開きたい')]);
  expect(result.searched).toBe(2); expect(result.results.map(t => t.id)).toEqual(['reading']);
  expect(result.results[0].matches).toContain('読書会'); expect(result.results[0].goal).toContain('交流');
});
it('does not claim matches for empty consultations or other vault histories', () => {
  expect(() => findSimilarTasks(fixture(), 'chat', [])).toThrow('少ない');
  expect(() => findSimilarTasks(fixture(), 'chat', [turn('読書会', 'other')])).toThrow('少ない');
});
it('excludes the current task and ordinary collections, and returns no match honestly', () => {
  const vault = fixture(); const b = new TTThink(); b.ID = 'collection'; b.ContentType = 'bundle'; b.Content = '読書会の資料集'; vault.AddThink(b);
  expect(findSimilarTasks(vault, 'chat', [turn('読書会')], 'reading').results).toEqual([]);
  expect(findSimilarTasks(vault, 'chat', [turn('野球大会')]).results).toEqual([]);
});
