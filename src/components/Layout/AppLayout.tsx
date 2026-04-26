/**
 * AppLayout.tsx
 * Phase 10: ToDoPanel を実装コンポーネントに差し替え。
 *
 * 左から順に:
 *   ThinktankPanel（Ribbon + Area） |
 *   OverviewPanel（Ribbon + Area）  |
 *   WorkoutPanel（中央、flex:1）    |
 *   ToDoPanel（Area + Ribbon）
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { ThinktankPanel } from '../ThinktankPanel/ThinktankPanel';
import { OverviewPanel } from '../OverviewPanel/OverviewPanel';
import { WorkoutPanel } from '../WorkoutPanel/WorkoutPanel';
import { ToDoPanel } from '../ToDoPanel/ToDoPanel';
import './AppLayout.css';

// パネル幅の初期値・最小値
const THINKTANK_WIDTH = 240;
const OVERVIEW_WIDTH  = 260;
const TODO_WIDTH      = 260;
const MIN_PANEL_WIDTH = 120;

export function AppLayout() {
  const app = TTApplication.Instance;

  // 各パネルは内部で購読済みのため、AppLayout 側の個別購読は不要

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

      {/* ── ToDoPanel（Phase 10 実装済み）─────────────────────── */}
      <div className="app-panel app-panel--todo">
        <ToDoPanel
          app={app}
          width={todoWidth}
          onResize={onTodoSplitter}
        />
      </div>

    </div>
  );
}
