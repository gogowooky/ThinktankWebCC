import { expect, it } from 'vitest';
import { emptyProgress, validateProgress, readProgress, progressReview } from './progressRecord';
import { emptyThinkValues } from './thinkSupportRecord';
it('allows independent outcomes without imposing earlier milestones', () => {
  const input = { ...emptyProgress(), evidence: '実施結果を本人が確認', remaining: '検証は来週' };
  input.milestones.execution = 'achieved';
  expect(() => validateProgress(input)).not.toThrow();
  expect(input.milestones.decision).toBe('unrecorded');
});
it.each([
  { evidence: '', remaining: 'なし' },
  { evidence: '確認', remaining: '' },
  { evidence: '確認', remaining: 'なし', paused: true, resumeCondition: '' },
  { evidence: '確認', remaining: 'なし', reviewAt: '2026-02-30' },
  { evidence: '確認', remaining: 'なし', sources: [{ thinkId: 'outside/path', contentHash: 'a'.repeat(64) }] },
])('rejects incomplete confirmation evidence %j', changes => {
  expect(() => validateProgress({ ...emptyProgress(), ...changes })).toThrow();
});
it('preserves pause and resume as separate historical confirmations', () => {
  const input = { ...emptyProgress(), evidence: '回答待ち', remaining: '費用確認', paused: true, resumeCondition: '回答が届いたら' };
  const log = readProgress({ schemaVersion: 1, events: [
    { id: 'pause', revision: 1, author: 'human', confirmedAt: '2026-09-14T00:00:00Z', input },
    { id: 'resume', revision: 2, author: 'human', confirmedAt: '2026-09-15T00:00:00Z', input: { ...input, paused: false, evidence: '回答が届いた' } },
  ] });
  expect(log.events[0].input.paused).toBe(true); expect(log.events[1].input.paused).toBe(false);
  expect(() => readProgress({ schemaVersion: 2, events: [] })).toThrow();
});
it('never infers a new completion from old metadata or an AI proposal', () => {
  expect(readProgress(undefined).events).toEqual([]);
  const metadata = { thoughtSupport: { state: '完了', decisions: '済み' } };
  const before = JSON.stringify(metadata); const review = progressReview(metadata, 'bundle');
  expect(review.notes.some(n => n.includes('未記録'))).toBe(true); expect(JSON.stringify(metadata)).toBe(before);
});
it('offers comparison against completion criteria without confirming completion', () => {
  const review = progressReview({ thinkSupport: { schemaVersion: 1, revision: 1, author: 'human', confirmedAt: '2026-09-14T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z',
    values: { ...emptyThinkValues(), goal: '比較', completionCriteria: '3候補を比較' }, sources: {} } }, 'bundle');
  expect(review.goal).toBe('比較'); expect(review.notes.some(n => n.includes('照合'))).toBe(true);
});
