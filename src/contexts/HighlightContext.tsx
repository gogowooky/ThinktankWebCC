/**
 * HighlightContext.tsx
 * 全グリッドで共有するハイライトID群を提供する Context。
 *
 * seedsBundleIds  : SeedsPanelで選択中BundleのThink ID一覧
 * developIds         : DevelopPanelで現在開いているThink ID一覧
 */

import { createContext, useContext } from 'react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { TTApplication } from '../views/TTApplication';

interface HighlightState {
  seedsBundleIds: string[];
  seedsIncludedIds: string[];
  seedsCheckedIds: string[];
  developIds: string[];
  developFocusedId: string | null;
}

const HighlightContext = createContext<HighlightState>({
  seedsBundleIds: [],
  seedsIncludedIds: [],
  seedsCheckedIds: [],
  developIds: [],
  developFocusedId: null,
});

export function useHighlight(): HighlightState {
  return useContext(HighlightContext);
}

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const app      = TTApplication.Instance;
  const seeds = app.SeedsPanel;
  const develop  = app.DevelopPanel;
  const vault    = app.Models.Vault;

  useAppUpdate(seeds);
  useAppUpdate(develop);
  useAppUpdate(vault);

  const seedsBundleId = seeds.BundleID;
  const seedsBundleIds = seedsBundleId ? [seedsBundleId] : [];

  const seedsIncludedIds = seedsBundleId
    ? vault.GetThinksForBundle(seedsBundleId).map(t => t.ID)
    : [];

  const seedsCheckedIds = seeds.CheckedThoughtIDs;

  const developIds = develop.Areas.map(a => a.ResourceID).filter(Boolean);

  const focusedArea = develop.Areas.find(a => a.ID === develop.FocusedAreaId);
  const developFocusedId = focusedArea ? focusedArea.ResourceID : null;

  return (
    <HighlightContext.Provider
      value={{
        seedsBundleIds,
        seedsIncludedIds,
        seedsCheckedIds,
        developIds,
        developFocusedId,
      }}
    >
      {children}
    </HighlightContext.Provider>
  );
}
