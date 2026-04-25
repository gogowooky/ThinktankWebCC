/**
 * AppLayout.tsx
 * Phase 5: 4パネルグリッドレイアウト。
 *
 * 左から順に:
 *   ThinktankPanel（Ribbon + Area） |
 *   OverviewPanel（Ribbon + Area）  |
 *   WorkoutPanel（中央、flex:1）    |
 *   ToDoPanel（Area + Ribbon）
 *
 * ThinktankPanel / OverviewPanel / ToDoPanel は Area を開閉可能。
 * WorkoutPanel は常時表示で中央を占有する。
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelRibbon } from './PanelRibbon';
import { PanelArea } from './PanelArea';
import { Splitter } from './Splitter';
import './AppLayout.css';

// パネル幅の初期値・最小値
const THINKTANK_WIDTH = 240;
const OVERVIEW_WIDTH  = 260;
const TODO_WIDTH      = 260;
const MIN_PANEL_WIDTH = 120;

export function AppLayout() {
  const app = TTApplication.Instance;

  // 各パネルの開閉状態をビューモデルから購読
  useAppUpdate(app.ThinktankPanel);
  useAppUpdate(app.OverviewPanel);
  useAppUpdate(app.ToDoPanel);

  // Splitter でサイズ変更可能なパネル幅（ローカル state）
  const [ttWidth,      setTtWidth]      = useState(THINKTANK_WIDTH);
  const [overviewWidth, setOverviewWidth] = useState(OVERVIEW_WIDTH);
  const [todoWidth,    setTodoWidth]    = useState(TODO_WIDTH);

  // ── Splitter ハンドラー ──────────────────────────────────────────

  const onTtSplitter = useCallback((dx: number) => {
    setTtWidth(w => Math.max(MIN_PANEL_WIDTH, w + dx));
  }, []);

  const onOverviewSplitter = useCallback((dx: number) => {
    setOverviewWidth(w => Math.max(MIN_PANEL_WIDTH, w + dx));
  }, []);

  const onTodoSplitter = useCallback((dx: number) => {
    setTodoWidth(w => Math.max(MIN_PANEL_WIDTH, w - dx)); // Todo は右端なので逆方向
  }, []);

  // ── 開閉 ────────────────────────────────────────────────────────

  const toggleThinktank = useCallback(() => app.ThinktankPanel.ToggleArea(), [app]);
  const toggleOverview  = useCallback(() => app.OverviewPanel.ToggleArea(),  [app]);
  const toggleToDo      = useCallback(() => app.ToDoPanel.ToggleArea(),      [app]);

  return (
    <div className="app-layout">

      {/* ── ThinktankPanel ─────────────────────────────────────── */}
      <div className="app-panel app-panel--thinktank">
        <PanelRibbon
          panelId="thinktank"
          side="left"
          isOpen={app.ThinktankPanel.IsAreaOpen}
          onToggle={toggleThinktank}
        />
        <PanelArea
          panelId="thinktank"
          isOpen={app.ThinktankPanel.IsAreaOpen}
          width={ttWidth}
        >
          <div className="panel-placeholder">
            <div className="panel-placeholder__title">ThinktankPanel</div>
            <div className="panel-placeholder__desc">Thoughts 一覧（Phase 6）</div>
          </div>
        </PanelArea>
        {app.ThinktankPanel.IsAreaOpen && (
          <Splitter onResize={onTtSplitter} />
        )}
      </div>

      {/* ── OverviewPanel ──────────────────────────────────────── */}
      <div className="app-panel app-panel--overview">
        <PanelRibbon
          panelId="overview"
          side="left"
          isOpen={app.OverviewPanel.IsAreaOpen}
          onToggle={toggleOverview}
        />
        <PanelArea
          panelId="overview"
          isOpen={app.OverviewPanel.IsAreaOpen}
          width={overviewWidth}
        >
          <div className="panel-placeholder">
            <div className="panel-placeholder__title">OverviewPanel</div>
            <div className="panel-placeholder__desc">Thought 表示（Phase 9）</div>
          </div>
        </PanelArea>
        {app.OverviewPanel.IsAreaOpen && (
          <Splitter onResize={onOverviewSplitter} />
        )}
      </div>

      {/* ── WorkoutPanel ───────────────────────────────────────── */}
      <div className="app-panel app-panel--workout">
        <div className="panel-placeholder panel-placeholder--workout">
          <div className="panel-placeholder__title">WorkoutPanel</div>
          <div className="panel-placeholder__desc">WorkoutArea 群（Phase 7）</div>
        </div>
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
