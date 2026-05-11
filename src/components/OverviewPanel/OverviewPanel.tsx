/**
 * OverviewPanel.tsx
 * OverviewPanel 統合コンポーネント。
 *
 * 構造: [OverviewRibbon] [PanelArea > OverviewArea] [Splitter]
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { OverviewRibbon } from './OverviewRibbon';
import { OverviewArea } from './OverviewArea';
import './OverviewPanel.css';

const MIN_WIDTH = 160;

interface Props {
  app: TTApplication;
  width: number;
  onResize: (delta: number) => void;
}

export function OverviewPanel({ app, width, onResize }: Props) {
  const panel = app.OverviewPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);

  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    app.RefreshAll().catch(e => console.error('[OverviewPanel] RefreshAll failed:', e));
  }, [app]);

  const handleToggle = useCallback(() => panel.ToggleArea(), [panel]);
  const handleThoughtDrop = useCallback((id: string) => {
    const dropped = vault.GetThink(id);
    if (!dropped || dropped.ContentType === 'thought') {
      panel.OpenThought(id, 'datagrid');
    }
  }, [vault, panel]);
  const handleViewMode = useCallback((mode: Parameters<typeof panel.SetViewMode>[0]) => {
    if (!panel.IsAreaOpen) {
      panel.SetViewMode(mode);
      panel.OpenArea();
    } else if (panel.ViewMode === mode) {
      panel.CloseArea();
    } else {
      panel.SetViewMode(mode);
    }
  }, [panel]);
  const handleToggleSettings = useCallback(() => {
    handleViewMode('settings');
  }, [handleViewMode]);

  return (
    <div className="overview-panel">
      <OverviewRibbon
        isOpen={panel.IsAreaOpen}
        viewMode={panel.ViewMode}
        onToggle={handleToggle}
        onViewMode={handleViewMode}
        onToggleSettings={handleToggleSettings}
        thoughtName={panel.ThoughtID ? (vault.GetThink(panel.ThoughtID)?.Name ?? panel.ThoughtID) : undefined}
        onThoughtDrop={handleThoughtDrop}
      />
      <PanelArea
        panelId="overview"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <OverviewArea app={app} showSettings={panel.ViewMode === 'settings'} refreshKey={refreshKey} />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={onResize} />
      )}
    </div>
  );
}
