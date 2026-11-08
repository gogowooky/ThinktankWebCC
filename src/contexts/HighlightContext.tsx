/**
 * HighlightContext.tsx
 * 全グリッドで共有するハイライトID群を提供する Context。
 *
 * seedsBundleIds  : SeedsPanelで選択中BundleのThink ID一覧
 * workingIds         : WorkingPanelで現在開いているThink ID一覧
 */

import { createContext, useContext, useMemo, useRef } from 'react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { TTApplication } from '../views/TTApplication';

interface HighlightState {
  seedsBundleIds: string[];
  seedsIncludedIds: string[];
  seedsCheckedIds: string[];
  workingIds: string[];
  workingFocusedId: string | null;
}

const HighlightContext = createContext<HighlightState>({
  seedsBundleIds: [],
  seedsIncludedIds: [],
  seedsCheckedIds: [],
  workingIds: [],
  workingFocusedId: null,
});

export function useHighlight(): HighlightState {
  return useContext(HighlightContext);
}

/** 通知のたびに配列を作り直しても、内容が同じなら購読側を再描画させない */
function useStableIds(ids: string[]): string[] {
  const stable = useRef(ids);
  if (stable.current.length !== ids.length || stable.current.some((id, index) => id !== ids[index])) {
    stable.current = ids;
  }
  return stable.current;
}

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const app      = TTApplication.Instance;
  const seeds = app.SeedsPanel;
  const working  = app.WorkingPanel;
  const vault    = app.Models.Vault;

  useAppUpdate(seeds);
  useAppUpdate(working);
  useAppUpdate(vault);

  const seedsBundleId = seeds.BundleID;
  const seedsBundleIds = useStableIds(seedsBundleId ? [seedsBundleId] : []);

  const seedsIncludedIds = useStableIds(seedsBundleId
    ? vault.GetThinksForBundle(seedsBundleId).map(t => t.ID)
    : []);

  const seedsCheckedIds = useStableIds(seeds.CheckedThoughtIDs);

  const workingIds = useStableIds(working.Areas.map(a => a.ResourceID).filter(Boolean));

  const focusedArea = working.Areas.find(a => a.ID === working.FocusedAreaId);
  const workingFocusedId = focusedArea ? focusedArea.ResourceID : null;

  const value = useMemo(
    () => ({ seedsBundleIds, seedsIncludedIds, seedsCheckedIds, workingIds, workingFocusedId }),
    [seedsBundleIds, seedsIncludedIds, seedsCheckedIds, workingIds, workingFocusedId],
  );

  return (
    <HighlightContext.Provider value={value}>
      {children}
    </HighlightContext.Provider>
  );
}
