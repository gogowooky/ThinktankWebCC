/**
 * SeedsPanel.tsx
 * SeedsPanel 統合コンポーネント。
 *
 * 構造: [SeedsTabBar] [PanelArea > SeedsArea] [Splitter]
 */

import { useCallback, useState } from 'react';
import { TTApplication } from '../../views/TTApplication';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { PanelArea } from '../Layout/PanelArea';
import { Splitter } from '../Layout/Splitter';
import { SeedsTabBar } from './SeedsTabBar';
import { SeedsArea } from './SeedsArea';
import { updateProjectTargets } from '../../utils/thinkFormat';
import './SeedsPanel.css';

const MIN_WIDTH = 160;

interface Props {
  app: TTApplication;
  width: number;
  onResize: (delta: number) => void;
}

export function SeedsPanel({ app, width, onResize }: Props) {
  const panel = app.SeedsPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);

  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    app.RefreshAll().catch(e => console.error('[SeedsPanel] RefreshAll failed:', e));
  }, [app]);

  const handleToggle = useCallback(() => panel.ToggleArea(), [panel]);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleBundleDrop = useCallback(async (id: string) => {
    const dropped = vault.GetThink(id);
    if (!dropped) return;

    const checkedIds = app.ThinktankPanel.CheckedThoughtIDs;
    const isMultipleDrag = checkedIds.length > 0 && checkedIds.includes(id);

    // 1ファイルのD&DでかつProjectであった場合、または複数選択されておらずドラッグされたのがProjectの場合
    if (!isMultipleDrag && dropped.ContentType === 'project') {
      panel.OpenProject(id, 'datagrid');
    } else {
      // 複数ファイルがチェックされている状態でドラッグされた場合、
      // または単体ファイルでかつproject以外がドラッグされた場合
      if (panel.ProjectID) {
        const targetBundle = vault.GetThink(panel.ProjectID);
        if (targetBundle && targetBundle.ContentType === 'project') {
          // 追加対象のファイルIDリスト（自分自身のProjectは除外）
          const droppedIds = (isMultipleDrag ? checkedIds : [id]).filter(tid => tid !== panel.ProjectID);
          if (droppedIds.length === 0) return;

          if (targetBundle.IsMetaOnly) await targetBundle.LoadContent();

          const contentLines = targetBundle.Content.split('\n');
          const hasFilter = contentLines.some(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('>') || trimmed.startsWith('>>');
          });

          let newIds: string[] = [];

          if (hasFilter) {
            // 現在のフィルター一致結果を非同期で取得
            const currentMatchedThinks = await vault.GetThinksForProjectAsync(targetBundle.ID);
            const currentMatchedIds = currentMatchedThinks.map(t => t.ID);
            newIds = Array.from(new Set([...currentMatchedIds, ...droppedIds]));
          } else {
            const existingIds = targetBundle.getThinkIds();
            newIds = Array.from(new Set([...existingIds, ...droppedIds]));
          }

          const targetItems = newIds.map(tid => {
            const t = vault.GetThink(tid);
            return { id: tid, contentType: t?.ContentType ?? 'memo', title: t?.Name };
          });
          targetBundle.Content = updateProjectTargets(targetBundle.Content, targetItems);

          await targetBundle.SaveContent();

          // キャッシュ更新と画面再ロード
          await vault.GetThinksForProjectAsync(targetBundle.ID);
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
      void handleBundleDrop(id);
    }
  }, [handleBundleDrop]);

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
      className={`seeds-panel${isDragOver ? ' seeds-panel--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <SeedsTabBar
        isOpen={panel.IsAreaOpen}
        viewMode={panel.ViewMode}
        onToggle={handleToggle}
        onViewMode={handleViewMode}
        onToggleSettings={handleToggleSettings}
        bundleName={panel.BundleID ? (vault.GetThink(panel.BundleID)?.Name ?? panel.BundleID) : undefined}
      />
      <PanelArea
        panelId="seeds"
        isOpen={panel.IsAreaOpen}
        width={Math.max(MIN_WIDTH, width)}
      >
        <SeedsArea app={app} showSettings={panel.ViewMode === 'settings'} refreshKey={refreshKey} />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={onResize} />
      )}
    </div>
  );
}
