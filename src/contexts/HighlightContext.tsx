/**
 * HighlightContext.tsx
 * 全グリッドで共有するハイライトID群を提供する Context。
 *
 * overviewThoughtIds : OverviewPanelで選択中ThoughtのThink ID一覧
 * workoutIds         : WorkoutPanelで現在開いているThink ID一覧
 */

import { createContext, useContext } from 'react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { TTApplication } from '../views/TTApplication';

interface HighlightState {
  overviewThoughtIds: string[];
  overviewIncludedIds: string[];
  overviewCheckedIds: string[];
  workoutIds: string[];
}

const HighlightContext = createContext<HighlightState>({
  overviewThoughtIds: [],
  overviewIncludedIds: [],
  overviewCheckedIds: [],
  workoutIds: [],
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

  const overviewThoughtId = overview.ThoughtID;
  const overviewThoughtIds = overviewThoughtId ? [overviewThoughtId] : [];

  const overviewIncludedIds = overviewThoughtId
    ? vault.GetThinksForThought(overviewThoughtId).map(t => t.ID)
    : [];

  const overviewCheckedIds = overview.CheckedThoughtIDs;

  const workoutIds = workout.Areas.map(a => a.ResourceID).filter(Boolean);

  return (
    <HighlightContext.Provider
      value={{
        overviewThoughtIds,
        overviewIncludedIds,
        overviewCheckedIds,
        workoutIds,
      }}
    >
      {children}
    </HighlightContext.Provider>
  );
}
