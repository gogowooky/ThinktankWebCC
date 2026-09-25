import type { TTVault } from '../models/TTVault';
import type { ConversationTurn } from './ConversationService';
import { parseManagedChatTitle } from '../utils/managedChat';

function terms(text: string): Set<string> {
  const result = new Set<string>();
  for (const word of text.normalize('NFKC').toLowerCase().match(/[\p{Script=Han}\p{Script=Katakana}ー]{2,}|[a-z0-9]{2,}/gu) ?? []) {
    if (['相談', '課題', '質問', '準備', '開始', '新規'].includes(word)) continue;
    result.add(word);
    if (!/^[a-z0-9]+$/.test(word)) for (let i = 0; i < word.length - 1; i++) result.add(word.slice(i, i + 2));
  }
  return result;
}
export interface SimilarTask { id: string; title: string; goal: string; completion: string; matches: string[]; score: number }
/** Search saved task descriptions locally; never present lexical matches as an AI verdict. */
export function findSimilarTasks(vault: TTVault, chatId: string, turns: ConversationTurn[], excludeId?: string) {
  const chat = vault.GetThink(chatId);
  const title = parseManagedChatTitle(chat?.Name ?? '')?.title ?? chat?.Name ?? '';
  const query = terms(`${title === '新しい相談' ? '' : title}\n${turns.filter(t => t.context.vaultId === vault.ID).slice(-12).map(t => t.question).join('\n')}`);
  if (!query.size) throw new Error('相談内容がまだ少ないため調査できません。取り組みたいことを会話で教えてください。');
  const tasks = vault.GetBundles().filter(b => b.ID !== excludeId && (b.Metadata.taskOrigin || b.Metadata.thinkSupport || b.Metadata.taskRelation
    || [...b.RelatedIDs.split(','), ...(!b.IsMetaOnly ? b.getThinkIds() : [])].some(id => {
      const member = vault.GetThink(id);
      return member?.ContentType === 'chat' && !!parseManagedChatTitle(member.Name);
    })));
  const results: SimilarTask[] = [];
  for (const task of tasks) {
    const raw: unknown = task.Metadata.thinkSupport;
    const values = raw && typeof raw === 'object' && 'values' in raw && raw.values && typeof raw.values === 'object'
      ? raw.values as Record<string, unknown> : {};
    const goal = typeof values.goal === 'string' ? values.goal : '';
    const completion = typeof values.completionCriteria === 'string' ? values.completionCriteria : '';
    const candidate = terms(`${task.Name}\n${goal}\n${completion}`);
    const matches = [...query].filter(term => candidate.has(term));
    if (!matches.length) continue;
    const score = matches.length / Math.sqrt(query.size * candidate.size);
    results.push({ id: task.ID, title: task.Name, goal, completion,
      matches: matches.filter(term => !matches.some(other => other !== term && other.includes(term))).slice(0, 6), score });
  }
  return { searched: tasks.length, results: results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 10) };
}
