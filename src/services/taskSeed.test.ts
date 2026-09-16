import { expect, it } from 'vitest';
import type { ConversationTurn } from './ConversationService';
import { taskSeedFromConversation } from './taskSeed';
function turn(proposals: { field: string; after: string }[], scope = 'chat-only') {
  return { context: { vaultId: 'vault', bundleId: 'chat', scope }, answer: { proposals } } as ConversationTurn;
}
it('uses only a complete pair from the latest response of the selected consultation', () => {
  const candidate = turn([{ field: 'goal', after: '祝う' }, { field: 'completionCriteria', after: '開催する' }]);
  expect(taskSeedFromConversation([candidate], 'vault', 'chat')).toEqual({ goal: '祝う', completionCriteria: '開催する' });
  expect(taskSeedFromConversation([candidate, turn([])], 'vault', 'chat')).toBeUndefined();
  expect(taskSeedFromConversation([candidate], 'other', 'chat')).toBeUndefined();
  expect(taskSeedFromConversation([candidate], 'vault', 'other')).toBeUndefined();
  expect(taskSeedFromConversation([turn(candidate.answer.proposals, 'bundle-only')], 'vault', 'chat')).toBeUndefined();
  expect(taskSeedFromConversation([turn([{ field: 'goal', after: '祝う' }])], 'vault', 'chat')).toBeUndefined();
});
