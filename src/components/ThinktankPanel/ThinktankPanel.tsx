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
import './ThinktankPanel.css';

const DEFAULT_WIDTH = 240;
const MIN_WIDTH     = 120;

interface Props {
  app: TTApplication;
  width: number;
  onResize: (delta: number) => void;
}

export function ThinktankPanel({ app, width, onResize }: Props) {
  const panel = app.ThinktankPanel;
  useAppUpdate(panel);

  const handleToggle = useCallback(() => panel.ToggleArea(), [panel]);

  const handleResize = useCallback((dx: number) => {
    onResize(dx);
  }, [onResize]);

  return (
    <div className="thinktank-panel">
      <ThinktankRibbon
        isOpen={panel.IsAreaOpen}
        onToggle={handleToggle}
      />
      <PanelArea
        panelId="thinktank"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <ThinktankArea app={app} />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={handleResize} />
      )}
    </div>
  );
}
