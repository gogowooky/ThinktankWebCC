import type { TTThink } from './TTThink';
import type { ThinkMeta } from '../services/storage/IStorageBackend';
import type { BundleContent } from '../utils/thinkFormat';
import { computeDateRange } from '../utils/dateUtils';
import { toLocalDate } from '../utils/localDateTime';

type DateRange = { from: string; to: string } | null;
interface Criteria { createdRange: DateRange; updatedRange: DateRange }

export interface BundleResolutionState {
  ids: Set<string>;
  excludedIds: Set<string>;
  conditions: Map<string, string>;
  filter: Criteria & { keyword: string };
  search: Criteria & { query: string };
}

export function createBundleResolutionState(): BundleResolutionState {
  return {
    ids: new Set(), excludedIds: new Set(), conditions: new Map(),
    filter: { keyword: '', createdRange: null, updatedRange: null },
    search: { query: '', createdRange: null, updatedRange: null },
  };
}

export function mergeBundleConditions(state: BundleResolutionState, parsed: BundleContent): string[] {
  parsed.excludeIds?.forEach(id => state.excludedIds.add(id));
  const conflicts: string[] = [];
  // 既存の「後から走査した非空条件を採用」を保ち、失われる条件を診断できるようにする。
  for (const [group, entries] of Object.entries({ filter: parsed.filter, search: parsed.search })) {
    for (const [key, value] of Object.entries(entries)) {
      if (!value) continue;
      const name = `${group}.${key}`;
      const encoded = JSON.stringify(value);
      if (state.conditions.has(name) && state.conditions.get(name) !== encoded) conflicts.push(name);
      state.conditions.set(name, encoded);
    }
  }
  if (parsed.filter.keyword) state.filter.keyword = parsed.filter.keyword;
  if (parsed.search.query) state.search.query = parsed.search.query;
  for (const group of ['filter', 'search'] as const) {
    for (const key of ['createdRange', 'updatedRange'] as const) {
      const condition = parsed[group][key];
      if (condition) state[group][key] = computeDateRange(condition.dateStr, condition.rangeStr);
    }
  }
  return conflicts;
}

function matchesDates(id: string, updatedAt: string, criteria: Criteria): boolean {
  const created = id.slice(0, 10);
  const updated = toLocalDate(updatedAt || id);
  return (!criteria.createdRange || (created >= criteria.createdRange.from && created <= criteria.createdRange.to))
    && (!criteria.updatedRange || (updated >= criteria.updatedRange.from && updated <= criteria.updatedRange.to));
}

function hasFilterConditions(state: BundleResolutionState): boolean {
  return !!(state.filter.keyword || state.filter.createdRange || state.filter.updatedRange);
}

export function hasBundleSearchConditions(state: BundleResolutionState): boolean {
  return !!(state.search.query || state.search.createdRange || state.search.updatedRange);
}

export function addBundleFilterMatches(state: BundleResolutionState, thinks: readonly TTThink[]): void {
  if (!hasFilterConditions(state)) return;
  const query = state.filter.keyword.toLowerCase();
  for (const think of thinks) {
    if (query && !`${think.Name} ${think.Keywords}`.toLowerCase().includes(query)) continue;
    if (matchesDates(think.ID, think.UpdatedAt, state.filter)) state.ids.add(think.ID);
  }
}

export function addBundleSearchMatches(state: BundleResolutionState, metas: readonly ThinkMeta[]): void {
  for (const meta of metas) {
    if (meta.category !== 'bundle' && matchesDates(meta.thinkid, meta.updatedAt, state.search)) state.ids.add(meta.thinkid);
  }
}

export function finishBundleResolution(state: BundleResolutionState, thinks: readonly TTThink[], allowImplicitAll = true) {
  if (state.ids.size === 0 && !hasFilterConditions(state) && !hasBundleSearchConditions(state)) {
    return { members: allowImplicitAll ? thinks.filter(t => !state.excludedIds.has(t.ID)) : [], missingIds: [], implicitAllBlocked: !allowImplicitAll };
  }
  for (const id of state.excludedIds) state.ids.delete(id);
  const byId = new Map(thinks.map(think => [think.ID, think]));
  const missingIds = [...state.ids].filter(id => !byId.has(id));
  const members = [...state.ids].map(id => byId.get(id)).filter((think): think is TTThink => think !== undefined);
  return { members, missingIds, implicitAllBlocked: false };
}
