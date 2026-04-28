/**
 * OverviewPanel.tsx
 * Phase 9: OverviewPanel 統合コンポーネント。
 *
 * 構造: [OverviewRibbon] [PanelArea > OverviewArea] [Splitter]
 * 選択された Thought の内容を Markdown / DataGrid / Graph で表示する。
 */

import { useCallback } from 'react';
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
  useAppUpdate(panel);

  const handleToggle    = useCallback(() => panel.ToggleArea(), [panel]);
  const handleMediaType = useCallback((type: Parameters<typeof panel.SetMediaType>[0]) => {
    panel.SetMediaType(type);
  }, [panel]);

  return (
    <div className="overview-panel">
      <OverviewRibbon
        isOpen={panel.IsAreaOpen}
        mediaType={panel.MediaType}
        onToggle={handleToggle}
        onMediaType={handleMediaType}
        onToggleSettings={() => {}}
      />
      <PanelArea
        panelId="overview"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <OverviewArea app={app} />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={onResize} />
      )}
    </div>
  );
}
