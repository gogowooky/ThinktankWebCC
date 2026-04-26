/**
 * AppLayout.tsx
 * Phase 9: OverviewPanel を実装コンポーネントに差し替え。
 *
 * 左から順に:
 *   ThinktankPanel（Ribbon + Area） |
 *   OverviewPanel（Ribbon + Area）  |
 *   WorkoutPanel（中央、flex:1）    |
 *   ToDoPanel（Area + Ribbon）
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelRibbon } from './PanelRibbon';
import { PanelArea } from './PanelArea';
import { Splitter } from './Splitter';
import { ThinktankPanel } from '../ThinktankPanel/ThinktankPanel';
import { OverviewPanel } from '../OverviewPanel/OverviewPanel';
import { WorkoutPanel } from '../WorkoutPanel/WorkoutPanel';
import './AppLayout.css';

// パネル幅の初期値・最小値
const THINKTANK_WIDTH = 240;
const OVERVIEW_WIDTH  = 260;
const TODO_WIDTH      = 260;
const MIN_PANEL_WIDTH = 120;

export function AppLayout() {
  const app = TTApplication.Instance;

  // ToDoPanel の開閉状態を購読（ThinktankPanel / OverviewPanel は内部で購読済み）
  useAppUpdate(app.ToDoPanel);

  // Splitter でサイズ変更可能なパネル幅（ローカル state）
  const [ttWidth,       setTtWidth]       = useState(THINKTANK_WIDTH);
  const [overviewWidth, setOverviewWidth] = useState(OVERVIEW_WIDTH);
  const [todoWidth,     setTodoWidth]     = useState(TODO_WIDTH);

  // ── Splitter ハンドラー ──────────────────────────────────────────

  const onTtSplitter = useCallback((dx: number) => {
    setTtWidth(w => Math.max(MIN_PANEL_WIDTH, w + dx));
  }, []);

  const onOverviewSplitter = useCallback((dx: number) => {
    setOverviewWidth(w => Math.max(MIN_PANEL_WIDTH, w + dx));
  }, []);

  const onTodoSplitter = useCallback((dx: number) => {
    setTodoWidth(w => Math.max(MIN_PANEL_WIDTH, w - dx));
  }, []);

  // ── 開閉 ────────────────────────────────────────────────────────

  const toggleToDo = useCallback(() => app.ToDoPanel.ToggleArea(), [app]);

  return (
    <div className="app-layout">

      {/* ── ThinktankPanel（Phase 6 実装済み）─────────────────── */}
      <ThinktankPanel
        app={app}
        width={ttWidth}
        onResize={onTtSplitter}
      />

      {/* ── OverviewPanel（Phase 9 実装済み）──────────────────── */}
      <div className="app-panel app-panel--overview">
        <OverviewPanel
          app={app}
          width={overviewWidth}
          onResize={onOverviewSplitter}
        />
      </div>

      {/* ── WorkoutPanel（Phase 7 実装済み）────────────────────── */}
      <div className="app-panel app-panel--workout">
        <WorkoutPanel app={app} />
      </div>

      {/* ── ToDoPanel ──────────────────────────────────────────── */}
      <div className="app-panel app-panel--todo">
        {app.ToDoPanel.IsAreaOpen && (
          <Splitter onResize={onTodoSplitter} />
        )}
        <PanelArea
          panelId="todo"
          isOpen={app.ToDoPanel.IsAreaOpen}
          width={todoWidth}
        >
          <div className="panel-placeholder">
            <div className="panel-placeholder__title">ToDoPanel</div>
            <div className="panel-placeholder__desc">AI 相談（Phase 10）</div>
          </div>
        </PanelArea>
        <PanelRibbon
          panelId="todo"
          side="right"
          isOpen={app.ToDoPanel.IsAreaOpen}
          onToggle={toggleToDo}
        />
      </div>

    </div>
  );
}
