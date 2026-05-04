/**
 * ReThinkPanel.tsx
 * Phase 10: ReThinkPanel 統合コンポーネント。
 *
 * 構造（右側パネル）: [Splitter] [PanelArea > ReThinkArea] [ReThinkRibbon]
 * Think/Thought の次の展開について AI と相談するパネル。
 */

import { useCallback, useState } from 'react';
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

  const [viewMode, setViewMode] = useState<ReThinkViewMode>('chat');

  const handleToggle    = useCallback(() => panel.ToggleArea(), [panel]);
  const handleClearChat = useCallback(() => panel.ClearChat(),  [panel]);
  const handleSetMode   = useCallback((mode: ReThinkViewMode) => setViewMode(mode), []);

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
        <ReThinkArea app={app} viewMode={viewMode} />
      </PanelArea>
      <ReThinkRibbon
        isOpen={panel.IsAreaOpen}
        viewMode={viewMode}
        onToggle={handleToggle}
        onSetMode={handleSetMode}
        onClearChat={handleClearChat}
      />
    </div>
  );
}
