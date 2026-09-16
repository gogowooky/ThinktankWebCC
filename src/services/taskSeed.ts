import type { ConversationTurn } from './ConversationService';
import { emptyThinkValues, type ThinkValues } from '../../server/services/thinkSupportRecord';

export type TaskSeed = Pick<ThinkValues, 'goal' | 'completionCriteria'>;

/** Only the latest saved response may supply a new task's purpose and finish line. */
export function taskSeedFromConversation(turns: ConversationTurn[], vaultId: string, chatId: string): TaskSeed | undefined {
  const turn = turns.at(-1);
  if (!turn || turn.context.vaultId !== vaultId || turn.context.scope !== 'chat-only' || turn.context.bundleId !== chatId) return;
  const values = emptyThinkValues();
  for (const proposal of turn.answer.proposals) values[proposal.field] = proposal.after;
  if (!values.goal.trim() || !values.completionCriteria.trim()) return;
  return { goal: values.goal, completionCriteria: values.completionCriteria };
}
