/**
 * ThinktankPanel.tsx
 * Phase 6: ThinktankPanel 統合コンポーネント。
 *
 * 構造: [ThinktankRibbon] [PanelArea > ThinktankArea]
 * AppLayout から差し込んで使う。
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { ThinktankRibbon } from './ThinktankRibbon';
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

  const handleResize = useCallback((dx: number) => {
    onResize(dx);
  }, [onResize]);

  return (
    <div className="thinktank-panel">
      <ThinktankRibbon
        isOpen={panel.IsAreaOpen}
        onToggle={handleToggle}
        viewMode={panel.ViewMode}
        onSetViewMode={handleSetViewMode}
        vaultName={vault.VaultName}
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
        />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={handleResize} />
      )}
    </div>
  );
}
