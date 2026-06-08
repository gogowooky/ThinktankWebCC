/**
 * OverviewPanel.tsx
 * OverviewPanel 統合コンポーネント。
 *
 * 構造: [OverviewTabBar] [PanelArea > OverviewArea] [Splitter]
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { OverviewTabBar } from './OverviewTabBar';
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
  const [isDragOver, setIsDragOver] = useState(false);

  const handleThoughtDrop = useCallback(async (id: string) => {
    const dropped = vault.GetThink(id);
    if (!dropped) return;

    const checkedIds = app.ThinktankPanel.CheckedThoughtIDs;
    const isMultipleDrag = checkedIds.length > 0 && checkedIds.includes(id);

    // 1ファイルのD&DでかつThoughtであった場合、または複数選択されておらずドラッグされたのがThoughtの場合
    if (!isMultipleDrag && dropped.ContentType === 'thought') {
      panel.OpenThought(id, 'datagrid');
    } else {
      // 複数ファイルがチェックされている状態でドラッグされた場合、
      // または単体ファイルでかつthought以外がドラッグされた場合
      if (panel.ThoughtID) {
        const targetThought = vault.GetThink(panel.ThoughtID);
        if (targetThought && targetThought.ContentType === 'thought') {
          // 追加対象のファイルIDリスト（自分自身のThoughtは除外）
          const droppedIds = (isMultipleDrag ? checkedIds : [id]).filter(tid => tid !== panel.ThoughtID);
          if (droppedIds.length === 0) return;

          if (targetThought.IsMetaOnly) await targetThought.LoadContent();

          const contentLines = targetThought.Content.split('\n');
          const hasFilter = contentLines.some(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('>') || trimmed.startsWith('>>');
          });

          let newIds: string[] = [];

          if (hasFilter) {
            // 現在のフィルター一致結果を非同期で取得
            const currentMatchedThinks = await vault.GetThinksForThoughtAsync(targetThought.ID);
            const currentMatchedIds = currentMatchedThinks.map(t => t.ID);
            newIds = Array.from(new Set([...currentMatchedIds, ...droppedIds]));

            const titleLine = contentLines[0];
            targetThought.Content = [titleLine, ...newIds.map(tid => `* ${tid}`)].join('\n');
          } else {
            const existingIds = targetThought.getThinkIds();
            newIds = Array.from(new Set([...existingIds, ...droppedIds]));

            const nonIdLines = contentLines.filter(line => !line.trim().startsWith('* '));
            targetThought.Content = [...nonIdLines, ...newIds.map(tid => `* ${tid}`)].join('\n');
          }

          await targetThought.SaveContent();
          
          // キャッシュ更新と画面再ロード
          await vault.GetThinksForThoughtAsync(targetThought.ID);
          setRefreshKey(k => k + 1);
          vault.NotifyUpdated();
        }
      }
    }
  }, [vault, panel, app]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-thought-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const id = e.dataTransfer.getData('application/x-thought-id');
    if (id) {
      handleThoughtDrop(id);
    }
  }, [handleThoughtDrop]);

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
    <div
      className={`overview-panel${isDragOver ? ' overview-panel--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <OverviewTabBar
        isOpen={panel.IsAreaOpen}
        viewMode={panel.ViewMode}
        onToggle={handleToggle}
        onViewMode={handleViewMode}
        onToggleSettings={handleToggleSettings}
        thoughtName={panel.ThoughtID ? (vault.GetThink(panel.ThoughtID)?.Name ?? panel.ThoughtID) : undefined}
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
