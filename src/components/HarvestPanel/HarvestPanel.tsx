/**
 * HarvestPanel.tsx
 * Phase 10: HarvestPanel 統合コンポーネント。
 *
 * 構造（右側パネル）: [Splitter] [PanelArea > HarvestArea] [HarvestTabBar]
 * Think/Bundle の次の展開について AI と相談するパネル。
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { HarvestTabBar, type HarvestViewMode } from './HarvestTabBar';
import { HarvestArea } from './HarvestArea';
import './HarvestPanel.css';

const MIN_WIDTH = 160;

interface Props {
  app: TTApplication;
  width: number;
  onResize: (delta: number) => void;
}

export function HarvestPanel({ app, width, onResize }: Props) {
  const panel = app.HarvestPanel;
  useAppUpdate(panel);

  const handleToggle  = useCallback(() => panel.ToggleArea(), [panel]);
  const handleSetMode = useCallback(
    (mode: HarvestViewMode) => {
      if (!panel.IsAreaOpen) {
        panel.SetViewMode(mode);
        panel.OpenArea();
      } else if (panel.ViewMode === mode) {
        panel.CloseArea();
      } else {
        panel.SetViewMode(mode);
      }
    },
    [panel]
  );

  const handleResize = useCallback((dx: number) => {
    onResize(dx);
  }, [onResize]);

  return (
    <div className="harvest-panel">
      {panel.IsAreaOpen && (
        <Splitter onResize={handleResize} />
      )}
      <PanelArea
        panelId="harvest"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <HarvestArea app={app} viewMode={panel.ViewMode} />
      </PanelArea>
      <HarvestTabBar
        isOpen={panel.IsAreaOpen}
        viewMode={panel.ViewMode}
        onToggle={handleToggle}
        onSetMode={handleSetMode}
      />
    </div>
  );
}
