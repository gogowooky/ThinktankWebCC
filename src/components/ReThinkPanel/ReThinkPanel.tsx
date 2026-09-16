/**
 * ReThinkPanel.tsx
 * Phase 10: ReThinkPanel 統合コンポーネント。
 *
 * 構造（右側パネル）: [Splitter] [PanelArea > ReThinkArea] [ReThinkTabBar]
 * Think/Bundle の次の展開について AI と相談するパネル。
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { useAiChatPanelWidth } from '../../utils/aiChatFocusWidth';
import { ReThinkTabBar, type ReThinkViewMode } from './ReThinkTabBar';
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

  // 親パネルにフォーカスがあり AIChat が開いている間だけ広げた幅。
  // state は触らないので、条件を外れれば元の幅に戻る。
  const shownWidth = useAiChatPanelWidth('ReThink', Math.max(MIN_WIDTH, width), panel.IsAreaOpen && panel.ViewMode === 'chat');

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
        width={shownWidth}
      >
        <ReThinkArea app={app} viewMode={panel.ViewMode} />
      </PanelArea>
      <ReThinkTabBar
        isOpen={panel.IsAreaOpen}
        viewMode={panel.ViewMode}
        onToggle={handleToggle}
        onSetMode={handleSetMode}
      />
    </div>
  );
}
