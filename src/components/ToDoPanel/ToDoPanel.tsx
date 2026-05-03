/**
 * ToDoPanel.tsx
 * Phase 10: ToDoPanel 統合コンポーネント。
 *
 * 構造（右側パネル）: [Splitter] [PanelArea > ToDoArea] [ToDoRibbon]
 * Think/Thought の次の展開について AI と相談するパネル。
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { ToDoRibbon, type ToDoViewMode } from './ToDoRibbon';
import { ToDoArea } from './ToDoArea';
import './ToDoPanel.css';

const MIN_WIDTH = 160;

interface Props {
  app: TTApplication;
  width: number;
  onResize: (delta: number) => void;
}

export function ToDoPanel({ app, width, onResize }: Props) {
  const panel = app.ToDoPanel;
  useAppUpdate(panel);

  const [viewMode, setViewMode] = useState<ToDoViewMode>('chat');

  const handleToggle    = useCallback(() => panel.ToggleArea(), [panel]);
  const handleClearChat = useCallback(() => panel.ClearChat(),  [panel]);
  const handleSetMode   = useCallback((mode: ToDoViewMode) => setViewMode(mode), []);

  const handleResize = useCallback((dx: number) => {
    onResize(dx);
  }, [onResize]);

  return (
    <div className="todo-panel">
      {panel.IsAreaOpen && (
        <Splitter onResize={handleResize} />
      )}
      <PanelArea
        panelId="todo"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <ToDoArea app={app} viewMode={viewMode} />
      </PanelArea>
      <ToDoRibbon
        isOpen={panel.IsAreaOpen}
        viewMode={viewMode}
        onToggle={handleToggle}
        onSetMode={handleSetMode}
        onClearChat={handleClearChat}
      />
    </div>
  );
}
