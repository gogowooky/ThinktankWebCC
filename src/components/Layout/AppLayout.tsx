/**
 * AppLayout.tsx
 * Phase 10: ReThinkPanel を実装コンポーネントに差し替え。
 *
 * 左から順に:
 *   ThinktankPanel（Ribbon + Area） |
 *   OverviewPanel（Ribbon + Area）  |
 *   WorkoutPanel（中央、flex:1）    |
 *   ReThinkPanel（Area + Ribbon）
 *
 * レイアウトモード:
 *   'sipoc'  … 全パネル表示（デフォルト）
 *   'simple' … OverviewPanel / ReThinkPanel を非表示
 */

import { useCallback, useEffect, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { HighlightProvider } from '../../contexts/HighlightContext';
import { ThinktankPanel } from '../ThinktankPanel/ThinktankPanel';
import { OverviewPanel } from '../OverviewPanel/OverviewPanel';
import { WorkoutPanel } from '../WorkoutPanel/WorkoutPanel';
import { ReThinkPanel } from '../ReThinkPanel/ReThinkPanel';
import { ApplicationStatusBarArea } from './ApplicationStatusBarArea';
import { THEME_STATUS_KEYS, applyPanelThemeCss } from '../../utils/panelTheme';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { INIT_AREA_WIDTH, MIN_AREA_WIDTH, useResolvedAreaWidth } from '../../utils/panelAreaWidth';
import './AppLayout.css';

// パネル本文領域の初期幅・最小値は utils/panelAreaWidth.ts に集約（Workout 側と共用）

export type LayoutMode = 'sipoc' | 'simple';

const LS_LAYOUT_MODE = 'tt-layout-mode';

function loadLayoutMode(): LayoutMode {
  const v = localStorage.getItem(LS_LAYOUT_MODE);
  return v === 'simple' ? 'simple' : 'sipoc';
}

export function AppLayout() {
  const app = TTApplication.Instance;

  // 表示幅は各パネルの Status（<Panel>Panel.Area.OpenWidth）のモードで決まる。
  // Splitter で変えた値は AreaUserWidth に持ち、モードを user に倒す。
  useAppUpdate(app.ThinktankPanel);
  useAppUpdate(app.OverviewPanel);
  useAppUpdate(app.ReThinkPanel);

  const ttWidth       = useResolvedAreaWidth('ThinktankPanel.Area.OpenWidth', app.ThinktankPanel.AreaWidthMode, INIT_AREA_WIDTH.Thinktank, app.ThinktankPanel.AreaUserWidth);
  const overviewWidth = useResolvedAreaWidth('OverviewPanel.Area.OpenWidth', app.OverviewPanel.AreaWidthMode,  INIT_AREA_WIDTH.Overview,  app.OverviewPanel.AreaUserWidth);
  const rethinkWidth  = useResolvedAreaWidth('ReThinkPanel.Area.OpenWidth', app.ReThinkPanel.AreaWidthMode,   INIT_AREA_WIDTH.ReThink,   app.ReThinkPanel.AreaUserWidth);

  // レイアウトモード（sipoc / simple）
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(loadLayoutMode);

  const handleLayoutModeChange = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    TTUIStateManager.instance.applyProperty('Application.PanelDisplay.Mode', mode === 'simple' ? 'Simple' : 'Normal');
  }, []);

  // TTUIStateManager から Application.PanelDisplay.Mode 変化を受け取って layoutMode を同期
  useEffect(() => {
    const listener = (_key: string, value: string) => {
      const next: LayoutMode = value === 'Simple' ? 'simple' : 'sipoc';
      setLayoutMode(next);
    };
    TTUIStateManager.instance.addListener('Application.PanelDisplay.Mode', listener);
    return () => TTUIStateManager.instance.removeListener('Application.PanelDisplay.Mode', listener);
  }, []);

  // パネルのテーマ色（<Panel>.Theme.* / FocusingBorder.Theme.*）を CSS 変数へ展開する。
  // 派生色は color-mix() で作るため、基礎色1つの変更が関連色すべてに波及する。
  useEffect(() => {
    const apply = () => applyPanelThemeCss(app.WorkoutPanel.TextEditor.ColorStatus);
    apply();
    const listener = () => apply();
    for (const key of THEME_STATUS_KEYS) {
      TTUIStateManager.instance.addListener(key, listener);
    }
    return () => {
      for (const key of THEME_STATUS_KEYS) {
        TTUIStateManager.instance.removeListener(key, listener);
      }
    };
  }, [app]);

  // ── Splitter ハンドラー ──────────────────────────────────────────

  /** Splitter 操作を「ユーザー設定値」として反映する（現在の表示幅を起点に増減する） */
  const resizeArea = useCallback((
    panel: { AreaWidthMode: string; AreaUserWidth: number; NotifyUpdated(): void },
    shownWidth: number, dx: number, statusKey: 'ThinktankPanel.Area.OpenWidth' | 'OverviewPanel.Area.OpenWidth' | 'ReThinkPanel.Area.OpenWidth',
  ) => {
    panel.AreaUserWidth = Math.max(MIN_AREA_WIDTH, shownWidth + dx);
    const wasUser = panel.AreaWidthMode === 'user';
    panel.AreaWidthMode = 'user';
    panel.NotifyUpdated();
    if (!wasUser) TTUIStateManager.instance.notifyPropertyChanged(statusKey);
  }, []);

  const onTtSplitter       = useCallback((dx: number) => resizeArea(app.ThinktankPanel, ttWidth,       dx,  'ThinktankPanel.Area.OpenWidth'), [resizeArea, app, ttWidth]);
  const onOverviewSplitter = useCallback((dx: number) => resizeArea(app.OverviewPanel,  overviewWidth, dx,  'OverviewPanel.Area.OpenWidth'),  [resizeArea, app, overviewWidth]);
  const onRethinkSplitter  = useCallback((dx: number) => resizeArea(app.ReThinkPanel,   rethinkWidth, -dx,  'ReThinkPanel.Area.OpenWidth'),   [resizeArea, app, rethinkWidth]);

  const showSidePanels = layoutMode === 'sipoc';

  return (
    <HighlightProvider>
    <div className="ApplicationContainer">
      <div className="ApplicationLayout">

        {/* ── ThinktankPanel（Phase 6 実装済み）─────────────────── */}
        <ThinktankPanel
          app={app}
          width={ttWidth}
          onResize={onTtSplitter}
          layoutMode={layoutMode}
          onLayoutModeChange={handleLayoutModeChange}
        />

        {/* ── OverviewPanel（Phase 9 実装済み）──────────────────── */}
        <div className="app-panel app-panel--overview" style={showSidePanels ? undefined : { display: 'none' }}>
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

        {/* ── ReThinkPanel（Phase 10 実装済み）─────────────────────── */}
        <div className="app-panel app-panel--rethink" style={showSidePanels ? undefined : { display: 'none' }}>
          <ReThinkPanel
            app={app}
            width={rethinkWidth}
            onResize={onRethinkSplitter}
          />
        </div>

      </div>
      <ApplicationStatusBarArea panel={app.WorkoutPanel} />
    </div>
    </HighlightProvider>
  );
}
