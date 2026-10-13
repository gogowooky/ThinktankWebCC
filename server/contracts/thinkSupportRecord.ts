/** Shared, runtime-validated P2 wire format. No server-only dependencies. */
export const THINK_FIELDS = ['goal', 'stage', 'provisionalConclusion', 'decisions', 'openQuestions', 'nextAction', 'completionCriteria'] as const;
export type ThinkField = typeof THINK_FIELDS[number];
export type ThinkValues = Record<ThinkField, string>;
export type ThinkSources = Partial<Record<ThinkField, { thinkId: string; contentHash: string }>>;
export interface ThinkSupportRecord {
  schemaVersion: 1;
  revision: number;
  values: ThinkValues;
  sources: ThinkSources;
  author: 'human';
  confirmedAt: string;
  updatedAt: string;
}
export function emptyThinkValues(): ThinkValues {
  return Object.fromEntries(THINK_FIELDS.map(k => [k, ''])) as ThinkValues;
}
export function validThinkInput(values: unknown, sources: unknown): values is ThinkValues {
  if (!values || typeof values !== 'object' || Array.isArray(values) || !sources || typeof sources !== 'object' || Array.isArray(sources)) return false;
  const v = values as Record<string, unknown>;
  if (Object.keys(v).length !== THINK_FIELDS.length || !THINK_FIELDS.every(k => typeof v[k] === 'string' && (v[k] as string).length <= 10000)) return false;
  return Object.entries(sources).every(([k, s]) => THINK_FIELDS.includes(k as ThinkField) && s && typeof s === 'object'
    && typeof s.thinkId === 'string' && /^[\w-]+$/.test(s.thinkId) && typeof s.contentHash === 'string' && /^[a-f0-9]{64}$/.test(s.contentHash));
}
export function readThinkSupport(raw: unknown): ThinkSupportRecord | null {
  if (raw == null) return null;
  const r = raw as ThinkSupportRecord;
  if (r.schemaVersion !== 1 || !Number.isSafeInteger(r.revision) || r.revision < 1 || r.author !== 'human'
    || !validThinkInput(r.values, r.sources) || typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt))
    || typeof r.confirmedAt !== 'string' || !Number.isFinite(Date.parse(r.confirmedAt))) {
    throw new Error('思考状態の保存形式に対応していません。既存データを保持して編集を停止しました。');
  }
  return r;
}
