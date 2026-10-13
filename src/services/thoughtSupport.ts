import type { ChatMessage } from '../types';
import type { TTThink } from '../models/TTThink';

export const PANELS = ['Thinktank', 'Seeds', 'Discuss', 'Harvest'] as const;
export type SupportPanel = typeof PANELS[number];
export const KINDS = ['ASK', 'TASK', 'TODO', 'PROJ', 'EVNT', 'LOOP'] as const;
export interface SupportRecord {
  version: number;
  bundleId: string;
  goal: string;
  completion: string;
  current: string;
  next: string;
  resume: string;
  decisions: string;
  undecided: string;
  proposals: string;
  waiting: string;
  remaining: string;
  references: string[];
  parentId: string;
  dependencies: string[];
  loopId: string;
  occurrence: string;
  repeatRule: string;
  due: string;
  scheduled: string;
  startsAt: string;
  endsAt: string;
  checklist: string;
  reviewAt: string;
  redisplayAt: string;
  confirmedAt: string;
  confirmationQuote: string;
  updatedAt: string;
  handoff: string;
  messages?: ChatMessage[];
  history?: Array<{ operationId: string; at: string; title: string; record: Omit<SupportRecord, 'history' | 'messages' | 'appliedOps'> }>;
  /** 冪等判定用の操作ID。巻き戻し用スナップショットより軽いので、history より長く保持する。 */
  appliedOps?: string[];
}
export function supportRecord(think?: TTThink): SupportRecord {
  return { version: 0, bundleId: '', goal: '', completion: '', current: '', next: '', resume: '', decisions: '', undecided: '', proposals: '', waiting: '', remaining: '', references: [], parentId: '', dependencies: [], loopId: '', occurrence: '', repeatRule: '', due: '', scheduled: '', startsAt: '', endsAt: '', checklist: '', reviewAt: '', redisplayAt: '', confirmedAt: '', confirmationQuote: '', updatedAt: '', handoff: '', ...think?.Metadata?.thoughtSupport };
}

export function isReviewDue(record: SupportRecord, now = new Date()) {
  return [record.reviewAt, record.redisplayAt].some(d => !!d && Date.parse(d.length === 10 ? `${d}T00:00:00` : d) <= now.getTime());
}
