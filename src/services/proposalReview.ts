import type { ConversationTurn } from './ConversationService';
import { emptyThinkValues, readThinkSupport } from '../../server/services/thinkSupportRecord';
import type { ThinkMeta } from './storage/IStorageBackend';

export function prepareProposalReview(turn: ConversationTurn, meta: ThinkMeta) {
  if (turn.context.scope !== 'bundle-only' || meta.id !== turn.context.bundleId || meta.contentType !== 'bundle') {
    throw new Error('提案先の課題が一致しません。');
  }
  const record = readThinkSupport(meta.metadata?.thinkSupport);
  const values = { ...(record?.values ?? emptyThinkValues()) };
  const sources = { ...record?.sources };
  for (const proposal of turn.answer.proposals) {
    if (values[proposal.field] !== proposal.before && values[proposal.field] !== proposal.after) {
      throw new Error('課題の記録が更新されています。AIと最新の内容を確認してから、もう一度整理してください。');
    }
    if (values[proposal.field] !== proposal.after) {
      values[proposal.field] = proposal.after;
      // The former statement's source must not be attributed to a new statement.
      delete sources[proposal.field];
    }
  }
  return { values, sources, alreadyApplied: turn.answer.proposals.every(p => record?.values[p.field] === p.after) };
}
