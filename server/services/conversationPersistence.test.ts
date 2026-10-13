import { expect, it, vi } from 'vitest';
import { appendConversationTurn } from './conversationPersistence';
import type { ConversationTurn } from '../contracts/conversationRecord';

class SaveError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const turn: ConversationTurn = {
  schemaVersion: 1, id: 'turn', createdAt: '2026-10-13T00:00:00Z', question: '質問', provider: 'test', model: 'test',
  context: { schemaVersion: 1, snapshotId: 'snapshot', vaultId: 'vault', bundleId: 'bundle', capturedAt: '2026-10-13T00:00:00Z',
    scope: 'bundle-only', quality: 'complete', sources: [], issues: [], manualState: null },
  answer: { reply: '回答', insufficientEvidence: false, citations: [], proposals: [] },
};
function state(turns: ConversationTurn[] = []) {
  return { metadata: { keep: { value: 1 } }, version: '2099-01-01T00:00:00Z', log: { schemaVersion: 1 as const, turns } };
}

it('appends without mutating the read snapshot and passes a monotonic version to persistence', async () => {
  const current = state();
  const persist = vi.fn().mockResolvedValue({ success: true, data: true });
  await appendConversationTurn(current, turn, persist, SaveError);
  expect(persist).toHaveBeenCalledWith({ keep: { value: 1 }, thinkConversations: { schemaVersion: 1, turns: [turn] } },
    { schemaVersion: 1, turns: [turn] }, '2099-01-01T00:00:00.001Z');
  expect(current.log.turns).toEqual([]);
});

it('accepts a reordered replay before capacity checks and rejects a changed payload', async () => {
  const reordered = Object.fromEntries(Object.entries(turn).reverse()) as unknown as ConversationTurn;
  const current = state(Array.from({ length: 100 }, (_, i) => i === 0 ? reordered : { ...turn, id: `saved-${i}` }));
  const persist = vi.fn();
  await appendConversationTurn(current, turn, persist, SaveError);
  await expect(appendConversationTurn(current, { ...turn, question: '別の質問' }, persist, SaveError)).rejects.toMatchObject({ status: 409 });
  expect(persist).not.toHaveBeenCalled();
});

it('blocks both the turn count and UTF-8 byte limit before persistence', async () => {
  const persist = vi.fn();
  await expect(appendConversationTurn(state(Array.from({ length: 100 }, (_, i) => ({ ...turn, id: `saved-${i}` }))), turn, persist, SaveError)).rejects.toMatchObject({ status: 409 });
  const oversized = { ...turn, answer: { ...turn.answer, reply: 'あ'.repeat(700000) } };
  await expect(appendConversationTurn(state(), oversized, persist, SaveError)).rejects.toMatchObject({ status: 409 });
  expect(persist).not.toHaveBeenCalled();
});

it.each([{ success: false, error: 'offline', status: 503 }, { success: true, data: false, status: 409 }])('keeps persistence failure distinct from a lost CAS: $status', async result => {
  const persist = vi.fn().mockResolvedValue(result);
  await expect(appendConversationTurn(state(), turn, persist, SaveError)).rejects.toMatchObject({ status: result.status });
});
