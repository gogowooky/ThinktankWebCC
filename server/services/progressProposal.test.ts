import { expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { ConversationService } from './ConversationService';
import { readConversationLog, mergeConversationTranscript, type ConversationContext } from './conversationRecord';

const context: ConversationContext = { schemaVersion: 1, snapshotId: 'snapshot', bundleId: 'bundle', vaultId: 'vault', capturedAt: '2026-09-22T00:00:00Z', scope: 'bundle-only', quality: 'complete', manualState: null, issues: [],
  sources: [{ thinkId: 'source', title: '資料', content: '資料', contentHash: createHash('sha256').update('資料').digest('hex') }] };
const proposal = { milestone: 'execution', reach: 'achieved', userQuote: '予約しました', reason: '本人による予約の実施報告' };
function answer(progressProposals: unknown, scope = context) {
  return new ConversationService({ name: 'test', model: 'test', generate: vi.fn().mockResolvedValue({ reply: '実行の到達候補を確認してください。', insufficientEvidence: false, citations: [], proposals: [], progressProposals }) })
    .answer('turn', '会場を予約しました。検証はまだです。', scope, [], new AbortController().signal);
}
it('preserves an unconfirmed candidate in structured history and Chat text without inferring verification', async () => {
  const turn = await answer([proposal]);
  expect(readConversationLog({ schemaVersion: 1, turns: [turn] }).turns[0].answer.progressProposals).toEqual([proposal]);
  expect(mergeConversationTranscript('既存本文', [turn])).toContain('AIの到達状態候補（未確認）');
  expect(turn.context).not.toHaveProperty('thinkProgress');
});
it.each([
  [{ ...proposal, userQuote: '検証しました' }],
  [{ ...proposal, milestone: 'completed' }],
  [{ ...proposal, reach: 'done' }],
  [{ ...proposal, reach: ['achieved'] }],
  [proposal, proposal], null,
])('rejects unsupported or ungrounded candidates: %j', async value => {
  await expect(answer(value)).rejects.toThrow('到達状態候補');
});
it('keeps older answers readable and rejects candidates in chat-only scope', async () => {
  const turn = await answer(undefined);
  expect(readConversationLog({ schemaVersion: 1, turns: [turn] }).turns).toHaveLength(1);
  await expect(answer([proposal], { ...context, scope: 'chat-only', snapshotId: 'chat', bundleId: 'chat', sources: [] })).rejects.toThrow();
});
