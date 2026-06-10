// 全体レイアウト：4パネル横並び＋最下段ステータスバー

import { app } from '../../views/TTApplication';
import { useNotify } from '../../hooks/useNotify';
import { ThinktankPanel } from '../ThinktankPanel/ThinktankPanel';
import { OverviewPanel } from '../OverviewPanel/OverviewPanel';
import { WorkoutPanel } from '../WorkoutPanel/WorkoutPanel';
import { ReThinkPanel } from '../ReThinkPanel/ReThinkPanel';
import { ApplicationStatusBarArea } from './ApplicationStatusBarArea';
import { Splitter } from './Splitter';
import './AppLayout.css';

const MIN_PANEL_WIDTH = 120;

export function AppLayout() {
  useNotify(app);
  const compact = app.LayoutMode === 'compact';

  return (
    <div className="ApplicationContainer">
      <div className="ApplicationLayout">
        <ThinktankPanel />
        <Splitter
          onDrag={(d) => {
            app.ThinktankWidth = Math.max(MIN_PANEL_WIDTH, app.ThinktankWidth + d);
            app.NotifyUpdated(false);
          }}
          onDragEnd={() => app.UIState.ApplyProperty('ThinktankPanel.Width', String(app.ThinktankWidth))}
        />
        {!compact && (
          <>
            <OverviewPanel />
            <Splitter
              onDrag={(d) => {
                app.OverviewWidth = Math.max(MIN_PANEL_WIDTH, app.OverviewWidth + d);
                app.NotifyUpdated(false);
              }}
              onDragEnd={() => app.UIState.ApplyProperty('OverviewPanel.Width', String(app.OverviewWidth))}
            />
          </>
        )}
        <WorkoutPanel />
        {!compact && (
          <>
            <Splitter
              onDrag={(d) => {
                app.ReThinkWidth = Math.max(MIN_PANEL_WIDTH, app.ReThinkWidth - d);
                app.NotifyUpdated(false);
              }}
              onDragEnd={() => app.UIState.ApplyProperty('ReThinkPanel.Width', String(app.ReThinkWidth))}
            />
            <ReThinkPanel />
          </>
        )}
      </div>
      <ApplicationStatusBarArea />
    </div>
  );
}
