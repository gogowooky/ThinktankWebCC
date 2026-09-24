import { expect, it, vi } from 'vitest';
import { validatePauseCandidates, validateSubtaskCandidates } from './lifecycleProposals';
import { ConversationService } from './ConversationService';
import { readConversationLog, mergeConversationTranscript, type ConversationContext } from './conversationRecord';
import { emptyProgress } from './progressRecord';

const candidate = { id: 'venue', title: '会場予約', goal: '会場を確保する', completionCriteria: '予約確認を受け取る', reason: '先に場所を確定する' };
const pause = { paused: true, userQuote: '保留します', reason: '回答待ち', resumeCondition: '', resumeSummary: '会場の返事を待つ' };
const context: ConversationContext = { schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId: 'bundle', capturedAt: '2026-09-24T00:00:00Z', scope: 'bundle-only', quality: 'complete', sources: [], issues: [], manualState: null,
  bundleProgress: { status: 'recorded', event: { id: 'event', revision: 1, author: 'human', confirmedAt: '2026-09-24T00:00:00Z', input: { ...emptyProgress(), evidence: '会場を比較した', remaining: '予約回答待ち' } } } };
it('passes resume context to the provider and preserves both candidate kinds in history and text', async () => {
  const generate = vi.fn().mockResolvedValue({ reply: '候補を確認してください。', insufficientEvidence: false, citations: [], proposals: [], subtaskCandidates: [candidate], pauseCandidates: [pause] });
  const turn = await new ConversationService({ name: 'test', model: 'test', generate }).answer('turn', '保留します', context, [], new AbortController().signal);
  expect(generate.mock.calls[0][0].context.bundleProgress.event.input.remaining).toBe('予約回答待ち');
  expect(readConversationLog({ schemaVersion: 1, turns: [turn] }).turns[0].answer.subtaskCandidates).toEqual([candidate]);
  expect(mergeConversationTranscript('本文', [turn])).toContain('AIのサブ課題候補（未採用）');
  expect(mergeConversationTranscript('本文', [turn])).toContain('AIの保留候補（未確認）');
  expect(context.bundleProgress?.event?.input.paused).toBe(false);
});
it.each([null, [candidate, candidate], Array(6).fill(candidate), [{ ...candidate, id: '' }], [{ ...candidate, title: '名前\n別の行' }], [{ ...candidate, goal: '' }]])('rejects malformed or duplicated decomposition candidates', value => {
  expect(() => validateSubtaskCandidates(value, 'bundle-only')).toThrow();
});
it.each([null, [pause, pause], [{ ...pause, userQuote: '再開します' }], [{ ...pause, paused: 'true' }]])('rejects unsupported pause candidates and fabricated user quotes', value => {
  expect(() => validatePauseCandidates(value, '保留します', 'bundle-only')).toThrow();
});
it('accepts legacy omission and rejects candidates outside a Bundle', () => {
  expect(() => validateSubtaskCandidates(undefined, 'bundle-only')).not.toThrow();
  expect(() => validatePauseCandidates(undefined, '', 'bundle-only')).not.toThrow();
  expect(() => validateSubtaskCandidates([candidate], 'chat-only')).toThrow();
  expect(() => validatePauseCandidates([pause], '保留します', 'chat-only')).toThrow();
});
