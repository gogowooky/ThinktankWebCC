/**
 * ThinktankPanel.tsx
 * Phase 6: ThinktankPanel 統合コンポーネント。
 *
 * 構造: [ThinktankTabBar] [PanelArea > ThinktankArea]
 * AppLayout から差し込んで使う。
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { StorageManager } from '../../services/storage/StorageManager';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { ThinktankTabBar } from './ThinktankTabBar';
import { ThinktankArea } from './ThinktankArea';
import type { LayoutMode } from '../Layout/AppLayout';
import './ThinktankPanel.css';

const DEFAULT_WIDTH = 240;
const MIN_WIDTH     = 120;

interface Props {
  app: TTApplication;
  width: number;
  onResize: (delta: number) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
}

export function ThinktankPanel({ app, width, onResize, layoutMode, onLayoutModeChange }: Props) {
  const panel = app.ThinktankPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);

  const handleToggle     = useCallback(() => panel.ToggleArea(), [panel]);
  const handleSetViewMode = useCallback(
    (m: Parameters<typeof panel.SetViewMode>[0]) => {
      if (!panel.IsAreaOpen) {
        panel.SetViewMode(m);
        panel.OpenArea();
      } else if (panel.ViewMode === m) {
        panel.CloseArea();
      } else {
        panel.SetViewMode(m);
      }
    },
    [panel]
  );

  const handleResize  = useCallback((dx: number) => {
    onResize(dx);
  }, [onResize]);

  const handleRefresh = useCallback(() => {
    app.RefreshAll().catch(e => console.error('[ThinktankPanel] RefreshAll failed:', e));
  }, [app]);

  const isElectron = StorageManager.instance.mode === 'electron';
  const handleSync = useCallback(() => {
    app.Status.SetSyncState('syncing');
    StorageManager.instance.syncFromServer()
      .then(r => {
        console.log(`[Sync] done: +${r.added} updated:${r.updated} skip:${r.skipped}`);
        app.Status.SetSyncState('synced');
        app.RefreshAll();
      })
      .catch(e => {
        console.error('[Sync] failed:', e);
        app.Status.SetSyncState('error');
      });
  }, [app]);

  return (
    <div className="thinktank-panel">
      <ThinktankTabBar
        isOpen={panel.IsAreaOpen}
        onToggle={handleToggle}
        viewMode={panel.ViewMode}
        onSetViewMode={handleSetViewMode}
        onRefresh={handleRefresh}
        onSync={isElectron ? handleSync : undefined}
        vaultName={vault.VaultName}
        isSimpleMode={layoutMode === 'simple'}
      />
      <PanelArea
        panelId="thinktank"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <ThinktankArea
          app={app}
          layoutMode={layoutMode}
          onLayoutModeChange={onLayoutModeChange}
          onRefresh={handleRefresh}
        />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={handleResize} />
      )}
    </div>
  );
}
