/** Titles are evidence of recorded state, never an inferred completion. */
export const MANAGED_STATES = ['未着手', '進行中', '待機', '保留', '完了', '中止'] as const;
export function parseManagedChatTitle(name: string) {
  const match = /^(TODO|PROJ|ASK|EVNT|LOOP):(Thinktank|Overview|Workout|ReThink)[｜|](.*)$/is.exec(name.trim());
  if (!match) return null;
  const state = /^\[([^\]]+)\]/.exec(match[3]);
  const known = state && (MANAGED_STATES as readonly string[]).includes(state[1]);
  const panel = ['Thinktank', 'Overview', 'Workout', 'ReThink'].find(p => p.toLowerCase() === match[2].toLowerCase())!;
  return { kind: match[1].toUpperCase(), panel, state: known ? state[1] : '状態未設定', title: known ? match[3].slice(state![0].length).trim() : match[3].trim() };
}
