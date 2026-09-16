import { expect, it } from 'vitest';
import { prepareProposalReview } from './proposalReview';
import { emptyThinkValues } from '../../server/services/thinkSupportRecord';
import type { ConversationTurn } from './ConversationService';
import type { ThinkMeta } from './storage/IStorageBackend';

const turn = { context: { scope: 'bundle-only', bundleId: 'bundle' }, answer: { proposals: [
  { field: 'goal', before: '旧目的', after: '誕生日会を開く', reason: '会話から' },
  { field: 'completionCriteria', before: '', after: '参加者が楽しめたことを確認', reason: '会話から' },
] } } as ConversationTurn;
function meta(): ThinkMeta {
  return { id: 'bundle', contentType: 'bundle', title: '誕生日会', keywords: '', relatedIds: '', sizeBytes: 0,
    isDeleted: false, createdAt: '2026-09-16T00:00:00Z', updatedAt: '2026-09-16T00:00:00Z', metadata: { thinkSupport: {
    schemaVersion: 1, revision: 1, author: 'human', updatedAt: '2026-09-16T00:00:00Z', confirmedAt: '2026-09-16T00:00:00Z',
    values: { ...emptyThinkValues(), goal: '旧目的', decisions: '既存の決定' },
    sources: { goal: { thinkId: 'old-source', contentHash: 'a'.repeat(64) } },
  } } } as ThinkMeta;
}
it('adopts proposed fields while preserving unrelated decisions and removing obsolete attribution', () => {
  const original = meta();
  const result = prepareProposalReview(turn, original);
  expect(result.values.goal).toBe('誕生日会を開く');
  expect(result.values.completionCriteria).toBe('参加者が楽しめたことを確認');
  expect(result.values.decisions).toBe('既存の決定');
  expect(result.sources.goal).toBeUndefined();
  expect(original.metadata!.thinkSupport.values.goal).toBe('旧目的');
});
it('refuses an outdated proposal or a different target', () => {
  const changed = meta(); changed.metadata!.thinkSupport.values.goal = '別の目的';
  expect(() => prepareProposalReview(turn, changed)).toThrow('更新されています');
  expect(() => prepareProposalReview(turn, { ...meta(), id: 'other' })).toThrow('一致しません');
});
it('recognizes an already applied proposal without requiring another write', () => {
  const applied = meta();
  for (const p of turn.answer.proposals) applied.metadata!.thinkSupport.values[p.field] = p.after;
  expect(prepareProposalReview(turn, applied).alreadyApplied).toBe(true);
});
