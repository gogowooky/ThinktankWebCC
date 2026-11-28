/**
 * WorkingPanel.tsx
 * BSP ツリー型レイアウトで WorkingArea を再帰的にレンダリングする。
 *
 * レイアウト構造（左→右）:
 *   [WorkingTabBar 40px] [WorkingSettingArea? + Splitter] [コンテンツ flex:1]
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import type { TTWorkingArea } from '../../views/TTWorkingArea';
import type { WorkingViewMode, PaneDirection, PanePlacement } from '../../views/TTWorkingPanel';
import { duplicateWorkingPane } from '../../views/insertWorkingPane';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { Splitter } from '../Layout/Splitter';
import { PanelArea } from '../Layout/PanelArea';
import { WorkingAreaEmpty } from './WorkingAreaEmpty';
import { WorkingTabBar, type SettingsType } from './WorkingTabBar';
import { WorkingSettingArea, type WorkingSettingAreaRef } from './WorkingSettingArea';
import type { MediaType } from '../../types';
import type { LayoutMode } from '../Layout/AppLayout';
import { TTUIStateManager } from '../../views/TTUIStateManager';
import { INIT_AREA_WIDTH, useResolvedAreaWidth } from '../../utils/panelAreaWidth';
import { computeEqualWidthRatios, computeEqualHeightRatios } from '../../utils/workingLayoutRatios';
import { LayoutView, type WorkingLayoutShared } from './WorkingLayoutView';
import { useWorkingPanelDrop } from './useWorkingPanelDrop';
import { useWorkingFileCommands } from './useWorkingFileCommands';
import './WorkingPanel.css';

// 初期幅は utils/panelAreaWidth.ts（INIT_AREA_WIDTH.Working）に集約
const MIN_SETTINGS_WIDTH     = 120;
const MAX_SETTINGS_WIDTH     = 400;

// ── WorkingPanel ──────────────────────────────────────────────────────

interface Props {
  app: TTApplication;
  layoutMode: LayoutMode;
}

export function WorkingPanel({ app, layoutMode }: Props) {
  const panel = app.WorkingPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);

  const isEditMode = layoutMode === 'simple';
  useAppUpdate(app.SeedsPanel);
  const seedsProjectId = app.SeedsPanel.ProjectID || undefined;

  // 設定パネル: 開閉は panel.IsAreaOpen、幅は Status WorkingSettingPanel.Area.OpenWidth のモードで決まる
  const settingsPanelWidth = useResolvedAreaWidth('WorkingSettingPanel.Area.OpenWidth', panel.AreaWidthMode, INIT_AREA_WIDTH.Working, panel.AreaUserWidth);
  const settingPanelRef = useRef<WorkingSettingAreaRef>(null);

  // 設定パネルが開いた時・モード切替時に対応要素へフォーカス
  useEffect(() => {
    if (!panel.IsAreaOpen) return;
    const timer = setTimeout(() => settingPanelRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [panel.IsAreaOpen, panel.ViewMode]);

  // split 比率（node.id → 0〜1）
  const [splitRatios, setSplitRatios] = useState<Record<string, number>>({});

  const {
    bodyRef, dragId, overAreaId, dragTitle, dragPos, isExternalDrag, dropOverlay, insertCaret,
    handleBodyDragOverCapture, handleBodyDragOver, handleBodyDragLeave, handleBodyDrop, handleBodyDropCapture,
    handleDragStart, handleDragEnter, handleDragLeave,
  } = useWorkingPanelDrop(panel, vault, seedsProjectId);

  const {
    handleCreateHtml, handleCreateMemo, handleCreateChat, handleReadMemo, handleSaveMemo,
    handleCreateTable, handleReadTable, handleSaveTable,
  } = useWorkingFileCommands(panel, vault, seedsProjectId);

  // ── フォーカスペインの Think タイトル ──────────────────────────────
  const focusedArea   = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
  const focusedThinkTitle = focusedArea
    ? (vault.GetThink(focusedArea.ResourceID)?.Name ?? '')
    : '';

  // ── ハンドラー ──────────────────────────────────────────────────────

  const handleSetActiveSettings = useCallback((type: SettingsType | null) => {
    if (type !== null) {
      panel.SetViewMode(type as WorkingViewMode);
      panel.OpenArea();
    } else {
      panel.CloseArea();
    }
  }, [panel]);

  const handleToggle = useCallback(() => {
    panel.ToggleArea();
  }, [panel]);

  // Splitter 操作は「ユーザー設定値」として反映する（現在の表示幅を起点に増減する）
  const handleSettingsResize = useCallback((delta: number) => {
    panel.AreaUserWidth = Math.max(MIN_SETTINGS_WIDTH, Math.min(MAX_SETTINGS_WIDTH, settingsPanelWidth + delta));
    const wasUser = panel.AreaWidthMode === 'user';
    panel.AreaWidthMode = 'user';
    panel.NotifyUpdated();
    if (!wasUser) TTUIStateManager.instance.notifyPropertyChanged('WorkingSettingPanel.Area.OpenWidth');
  }, [panel, settingsPanelWidth]);

  const handleFocus = useCallback((areaId: string) => {
    panel.FocusArea(areaId);
  }, [panel]);

  const handleSplitRatioDelta = useCallback((nodeId: string, deltaRatio: number) => {
    setSplitRatios(prev => ({ ...prev, [nodeId]: Math.max(0.1, Math.min(0.9, (prev[nodeId] ?? 0.5) + deltaRatio)) }));
  }, []);

  // ── エリア分割（FocusPaneと同じ内容）────────────────────────────────

  const handleInsertPane = useCallback((dir: PaneDirection, placement: PanePlacement) =>
    duplicateWorkingPane(panel, vault, dir, placement, seedsProjectId), [vault, panel, seedsProjectId]);

  const handleSplitRight = useCallback(() => handleInsertPane('right', 'split'), [handleInsertPane]);
  const handleSplitBelow = useCallback(() => handleInsertPane('down', 'split'), [handleInsertPane]);
  const handleSplitLeft = useCallback(() => handleInsertPane('left', 'split'), [handleInsertPane]);
  const handleSplitAbove = useCallback(() => handleInsertPane('up', 'split'), [handleInsertPane]);
  const handleAddRight = useCallback(() => handleInsertPane('right', 'add'), [handleInsertPane]);
  const handleAddBelow = useCallback(() => handleInsertPane('down', 'add'), [handleInsertPane]);
  const handleAddLeft = useCallback(() => handleInsertPane('left', 'add'), [handleInsertPane]);
  const handleAddTop = useCallback(() => handleInsertPane('up', 'add'), [handleInsertPane]);

  const handleRemoveFocused = useCallback(() => {
    if (panel.FocusedAreaId) panel.RemoveArea(panel.FocusedAreaId);
  }, [panel]);

  const handleSettingsRefresh = useCallback(() => {
    app.RefreshAll().catch(e => console.error('[WorkingPanel] RefreshAll failed:', e));
  }, [app]);

  const handleClearAll = useCallback(() => {
    panel.ClearAll();
  }, [panel]);

  // SeedsPanel.Bundle.ID で選択中のBundleに記載されていないThinkのPaneをすべて閉じる
  const handleCloseNotInBundle = useCallback(() => {
    const bundleId = app.SeedsPanel.BundleID;
    if (!bundleId) return;
    const idsInBundle = new Set(vault.GetThinksForBundle(bundleId).map(t => t.ID));
    panel.Areas
      .filter(a => a.ResourceID && !idsInBundle.has(a.ResourceID))
      .forEach(a => panel.RemoveArea(a.ID));
  }, [app, vault, panel]);

  const handleEqualizeWidths = useCallback(() => {
    if (!panel.Layout) return;
    setSplitRatios(prev => {
      const next = { ...prev };
      computeEqualWidthRatios(panel.Layout!, next);
      return next;
    });
  }, [panel]);

  const handleEqualizeHeights = useCallback(() => {
    if (!panel.Layout) return;
    setSplitRatios(prev => {
      const next = { ...prev };
      computeEqualHeightRatios(panel.Layout!, next);
      return next;
    });
  }, [panel]);

  const handleMediaType = useCallback((areaId: string, type: MediaType, rawYaml?: boolean) => {
    panel.SetMediaType(areaId, type, rawYaml);
  }, [panel]);

  const handleClose = useCallback((areaId: string) => {
    panel.RemoveArea(areaId);
  }, [panel]);

  // ── エリアマップ構築 ──────────────────────────────────────────────

  const areaMap = new Map<string, TTWorkingArea>(panel.Areas.map(a => [a.ID, a]));

  const shared: WorkingLayoutShared = {
    areas:           areaMap,
    vault,
    seedsProjectId,
    focusedAreaId:   panel.FocusedAreaId,
    dragId,
    overAreaId,
    splitRatios,
    isExternalDrag,
    onFocus:         handleFocus,
    onDragStart:     handleDragStart,
    onDragEnter:     handleDragEnter,
    onDragLeave:     handleDragLeave,
    onMediaType:     handleMediaType,
    onClose:         handleClose,
    onSplitRatioDelta: handleSplitRatioDelta,
  };

  // ── レンダリング ──────────────────────────────────────────────────

  return (
    <div className="working-panel">

      {/* ── 左縦リボン ───────────────────────────────────────── */}
      <WorkingTabBar
        activeSettings={panel.ViewMode}
        isOpen={panel.IsAreaOpen}
        thinkTitle={focusedThinkTitle}
        onToggle={handleToggle}
        onSetActiveSettings={handleSetActiveSettings}
        isEditMode={isEditMode}
      />

      {/* ── 設定パネル + Splitter ────────────────────────────── */}
      <PanelArea
        panelId="working"
        isOpen={panel.IsAreaOpen}
        width={settingsPanelWidth}
      >
        <WorkingSettingArea
          ref={settingPanelRef}
          activeSettings={panel.ViewMode}
          panel={panel}
          vault={vault}
          width={settingsPanelWidth}
          onSplitLeft={handleSplitLeft}
          onSplitRight={handleSplitRight}
          onSplitAbove={handleSplitAbove}
          onSplitBelow={handleSplitBelow}
          onAddLeft={handleAddLeft}
          onAddRight={handleAddRight}
          onAddTop={handleAddTop}
          onAddBottom={handleAddBelow}
          onRemoveFocused={handleRemoveFocused}
          onClearAll={handleClearAll}
          onCloseNotInBundle={handleCloseNotInBundle}
          hasBundle={!!app.SeedsPanel.BundleID}
          onEqualizeWidths={handleEqualizeWidths}
          onEqualizeHeights={handleEqualizeHeights}
          onCreateHtml={handleCreateHtml}
          onCreateMemo={handleCreateMemo}
          onReadMemo={handleReadMemo}
          onSaveMemo={handleSaveMemo}
          onCreateChat={handleCreateChat}
          onCreateTable={handleCreateTable}
          onReadTable={handleReadTable}
          onSaveTable={handleSaveTable}
          onRefresh={handleSettingsRefresh}
        />
      </PanelArea>
      {panel.IsAreaOpen && (
        <Splitter onResize={handleSettingsResize} />
      )}

      {/* ── コンテンツ領域 ────────────────────────────────────── */}
      <div
        ref={bodyRef}
        className="ContentsArea"
        onDragOverCapture={handleBodyDragOverCapture}
        onDragOver={handleBodyDragOver}
        onDragLeave={handleBodyDragLeave}
        onDrop={handleBodyDrop}
        onDropCapture={handleBodyDropCapture}
      >
        {panel.Layout === null ? (
          <WorkingAreaEmpty isFullPanel onAdd={handleAddRight} />
        ) : (
          <div className="working-panel__tree">
            <LayoutView node={panel.Layout} shared={shared} />
          </div>
        )}

        {/* D&D ドロップ位置プレビューオーバーレイ */}
        {dropOverlay && (
          <div
            className={`working-panel__drop-overlay working-panel__drop-overlay--${dropOverlay.ghost}`}
            style={{ position: 'absolute', pointerEvents: 'none', ...dropOverlay.style }}
          />
        )}

        {/* Alt+ThinkFileDrag（Insert）挿入位置プレビューCaret */}
        {insertCaret && (
          <div
            className="working-panel__insert-caret"
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              left: insertCaret.left,
              top: insertCaret.top,
              height: insertCaret.height,
            }}
          />
        )}

      </div>

      {/* ── ドラッグ Ghost ────────────────────────────────────── */}
      {dragId && dragTitle && dragPos && (
        <div
          className="working-drag-ghost"
          style={{ left: dragPos.x + 14, top: dragPos.y - 10 }}
        >
          <GripVertical size={12} />
          <span>{dragTitle}</span>
        </div>
      )}

    </div>
  );
}
