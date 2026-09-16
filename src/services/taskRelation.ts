export interface TaskRelation {
  schemaVersion: 1;
  parentId: string;
  chatId: string;
  turnId: string;
  panel: 'Workout';
}
export function readTaskRelation(value: unknown): TaskRelation | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as TaskRelation;
  if (r.schemaVersion !== 1 || r.panel !== 'Workout'
    || ![r.parentId, r.chatId, r.turnId].every(v => typeof v === 'string' && /^[\w-]{1,200}$/.test(v))) return;
  return r;
}
