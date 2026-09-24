import { id, object, text } from './conversationRecord.js';
import { validateProgress, type ProgressEvent } from './progressRecord.js';

export interface SubtaskContext {
  scope: 'loaded-direct-children';
  items: Array<{ bundleId: string; title: string; status: 'recorded' | 'unrecorded' | 'unreadable' | 'unsaved'; event?: ProgressEvent }>;
}
export const MAX_SUBTASKS = 50;
export const MAX_SUBTASK_CONTEXT_CHARS = 40000;
export function validateSubtaskContext(value: unknown, parentId: string): asserts value is SubtaskContext {
  if (!object(value) || value.scope !== 'loaded-direct-children' || !Array.isArray(value.items) || value.items.length > MAX_SUBTASKS
    || JSON.stringify(value).length > MAX_SUBTASK_CONTEXT_CHARS) throw new Error('子課題の状況が大きすぎるか形式が不正です。課題を分けてください。');
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!object(item) || !id(item.bundleId) || item.bundleId === parentId || seen.has(item.bundleId) || !text(item.title, 2000, true)
      || typeof item.status !== 'string' || !['recorded', 'unrecorded', 'unreadable', 'unsaved'].includes(item.status)) throw new Error('子課題の状況の形式が不正です。');
    seen.add(item.bundleId);
    if (item.status !== 'recorded') {
      if (item.event !== undefined) throw new Error('未確認の子課題に到達状態を付与できません。');
      continue;
    }
    const event = item.event;
    if (!object(event) || !id(event.id) || event.author !== 'human' || !Number.isInteger(event.revision) || (event.revision as number) < 1
      || !text(event.confirmedAt, 40) || !Number.isFinite(Date.parse(event.confirmedAt))) throw new Error('子課題の本人確認情報が不正です。');
    validateProgress(event.input);
  }
}

export const SUBTASK_REVIEW_QUESTION = 'この親課題の目的・完了条件と、読み込み済みの直接の子課題の本人確認済み記録を使って、全体の進め方を整理してください。子課題ごとの到達状態、残課題、保留と再開条件を確認し、未記録・読取不能・未保存は不明として区別してください。確認できる事実と推測を分け、優先する次の行動と理由、本人に確認すべき点を示してください。子課題の名前とID・確認日時を根拠に添えてください。親の残る論点と次の行動を変更する案は提案に留め、子課題や親課題の完了を自動確定しないでください。';
