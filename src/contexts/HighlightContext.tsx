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
  workoutIds: string[];
}

const HighlightContext = createContext<HighlightState>({
  overviewThoughtIds: [],
  workoutIds: [],
});

export function useHighlight(): HighlightState {
  return useContext(HighlightContext);
}

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const app      = TTApplication.Instance;
  const overview = app.OverviewPanel;
  const workout  = app.WorkoutPanel;

  useAppUpdate(overview);
  useAppUpdate(workout);

  const overviewThoughtIds = overview.ThoughtID ? [overview.ThoughtID] : [];

  const workoutIds = workout.Areas.map(a => a.ResourceID).filter(Boolean);

  return (
    <HighlightContext.Provider value={{ overviewThoughtIds, workoutIds }}>
      {children}
    </HighlightContext.Provider>
  );
}
