import type { TTThink } from './TTThink';

export interface BundleResolutionState {
  ids: Set<string>;
}

export function createBundleResolutionState(): BundleResolutionState {
  return { ids: new Set() };
}

export function finishBundleResolution(state: BundleResolutionState, thinks: readonly TTThink[]) {
  const byId = new Map(thinks.map(think => [think.ID, think]));
  const missingIds = [...state.ids].filter(id => !byId.has(id));
  const members = [...state.ids].map(id => byId.get(id)).filter((think): think is TTThink => think !== undefined);
  return { members, missingIds };
}
