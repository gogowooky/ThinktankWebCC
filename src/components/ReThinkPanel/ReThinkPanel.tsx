/**
 * ReThinkPanel.tsx
 * Phase 10: ReThinkPanel 統合コンポーネント。
 *
 * 構造（右側パネル）: [Splitter] [PanelArea > ReThinkArea] [ReThinkRibbon]
 * Think/Thought の次の展開について AI と相談するパネル。
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { ReThinkRibbon, type ReThinkViewMode } from './ReThinkRibbon';
import { ReThinkArea } from './ReThinkArea';
import './ReThinkPanel.css';

const MIN_WIDTH = 160;

interface Props {
  app: TTApplication;
  width: number;
  onResize: (delta: number) => void;
}

export function ReThinkPanel({ app, width, onResize }: Props) {
  const panel = app.ReThinkPanel;
  useAppUpdate(panel);

  const handleToggle  = useCallback(() => panel.ToggleArea(), [panel]);
  const handleSetMode = useCallback(
    (mode: ReThinkViewMode) => {
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
    <div className="rethink-panel">
      {panel.IsAreaOpen && (
        <Splitter onResize={handleResize} />
      )}
      <PanelArea
        panelId="rethink"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <ReThinkArea app={app} viewMode={panel.ViewMode} />
      </PanelArea>
      <ReThinkRibbon
        isOpen={panel.IsAreaOpen}
        viewMode={panel.ViewMode}
        onToggle={handleToggle}
        onSetMode={handleSetMode}
      />
    </div>
  );
}
