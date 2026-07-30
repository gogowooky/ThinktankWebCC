/**
 * HighlightContext.tsx
 * 全グリッドで共有するハイライトID群を提供する Context。
 *
 * overviewBundleIds  : OverviewPanelで選択中BundleのThink ID一覧
 * workoutIds         : WorkoutPanelで現在開いているThink ID一覧
 */

import { createContext, useContext } from 'react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { TTApplication } from '../views/TTApplication';

interface HighlightState {
  overviewBundleIds: string[];
  overviewIncludedIds: string[];
  overviewCheckedIds: string[];
  workoutIds: string[];
  workoutFocusedId: string | null;
}

const HighlightContext = createContext<HighlightState>({
  overviewBundleIds: [],
  overviewIncludedIds: [],
  overviewCheckedIds: [],
  workoutIds: [],
  workoutFocusedId: null,
});

export function useHighlight(): HighlightState {
  return useContext(HighlightContext);
}

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const app      = TTApplication.Instance;
  const overview = app.OverviewPanel;
  const workout  = app.WorkoutPanel;
  const vault    = app.Models.Vault;

  useAppUpdate(overview);
  useAppUpdate(workout);
  useAppUpdate(vault);

  const overviewBundleId = overview.BundleID;
  const overviewBundleIds = overviewBundleId ? [overviewBundleId] : [];

  const overviewIncludedIds = overviewBundleId
    ? vault.GetThinksForBundle(overviewBundleId).map(t => t.ID)
    : [];

  const overviewCheckedIds = overview.CheckedThoughtIDs;

  const workoutIds = workout.Areas.map(a => a.ResourceID).filter(Boolean);

  const focusedArea = workout.Areas.find(a => a.ID === workout.FocusedAreaId);
  const workoutFocusedId = focusedArea ? focusedArea.ResourceID : null;

  return (
    <HighlightContext.Provider
      value={{
        overviewBundleIds,
        overviewIncludedIds,
        overviewCheckedIds,
        workoutIds,
        workoutFocusedId,
      }}
    >
      {children}
    </HighlightContext.Provider>
  );
}
