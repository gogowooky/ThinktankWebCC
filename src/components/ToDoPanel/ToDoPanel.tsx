/**
 * ToDoPanel.tsx
 * Phase 10: ToDoPanel 統合コンポーネント。
 *
 * 構造（右側パネル）: [Splitter] [PanelArea > ToDoArea] [ToDoRibbon]
 * Think/Thought の次の展開について AI と相談するパネル。
 */

import { useCallback } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { ToDoRibbon } from './ToDoRibbon';
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

  const handleToggle    = useCallback(() => panel.ToggleArea(), [panel]);
  const handleClearChat = useCallback(() => panel.ClearChat(),  [panel]);

  const handleResize = useCallback((dx: number) => {
    // 右パネルは delta を逆転（右端固定・左端が動く）
    onResize(-dx);
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
        <ToDoArea app={app} />
      </PanelArea>
      <ToDoRibbon
        isOpen={panel.IsAreaOpen}
        onToggle={handleToggle}
        onClearChat={handleClearChat}
      />
    </div>
  );
}
