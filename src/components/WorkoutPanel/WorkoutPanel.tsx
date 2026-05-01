/**
 * WorkoutPanel.tsx
 * BSP ツリー型レイアウトで WorkoutArea を再帰的にレンダリングする。
 *
 * レイアウト構造（左→右）:
 *   [WorkoutRibbon 40px] [WorkoutSettingPanel? + Splitter] [コンテンツ flex:1]
 */

import { useCallback, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { TTVault } from '../../models/TTVault';
import type { LayoutNode, SplitNodeData } from '../../views/TTWorkoutPanel';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { Splitter } from '../Layout/Splitter';
import { PanelArea } from '../Layout/PanelArea';
import { WorkoutHSplitter } from './WorkoutHSplitter';
import { WorkoutArea, type DropEdgeDir } from './WorkoutArea';
import { WorkoutAreaEmpty } from './WorkoutAreaEmpty';
import { WorkoutRibbon } from './WorkoutRibbon';
import { WorkoutSettingPanel } from './WorkoutSettingPanel';
import type { SettingsType } from './WorkoutRibbon';
import type { MediaType } from '../../types';
import './WorkoutPanel.css';

// Think の ContentType → MediaType マッピング
function contentTypeToMediaType(contentType: string): MediaType {
  switch (contentType) {
    case 'markdown': return 'markdown';
    case 'thought':  return 'datagrid';
    case 'chat':     return 'chat';
    default:         return 'texteditor';
  }
}

// エッジ方向検出（threshold px 以内なら方向を返す）
function getEdgeDir(e: React.DragEvent, el: HTMLElement, threshold: number): DropEdgeDir | null {
  const rect = el.getBoundingClientRect();
  const dl = e.clientX - rect.left;
  const dr = rect.width  - (e.clientX - rect.left);
  const du = e.clientY - rect.top;
  const dd = rect.height - (e.clientY - rect.top);
  const min = Math.min(dl, dr, du, dd);
  if (min > threshold) return null;
  if (min === dl) return 'left';
  if (min === dr) return 'right';
  if (min === du) return 'up';
  return 'down';
}

const DEFAULT_SETTINGS_WIDTH = 180;
const MIN_SETTINGS_WIDTH     = 120;
const MAX_SETTINGS_WIDTH     = 400;

// ── shared props（再帰コンポーネントに引き回す）───────────────────────

interface SharedProps {
  areas:            Map<string, TTWorkoutArea>;
  vault:            TTVault;
  focusedAreaId:    string | null;
  dragId:           string | null;
  overAreaId:       string | null;
  splitRatios:      Record<string, number>;
  onFocus:          (areaId: string) => void;
  onDragStart:      (e: React.MouseEvent, areaId: string) => void;
  onDragEnter:      (areaId: string) => void;
  onDragLeave:      () => void;
  onMediaType:      (areaId: string, type: MediaType) => void;
  onClose:          (areaId: string) => void;
  onSplitRatio:     (nodeId: string, ratio: number) => void;
  onExternalDrop:   (dir: DropEdgeDir, thinkId: string, areaId: string) => void;
}

// ── LayoutView（再帰）───────────────────────────────────────────────────

function LayoutView({ node, shared }: { node: LayoutNode; shared: SharedProps }) {
  if (node.type === 'leaf') {
    const area = shared.areas.get(node.areaId);
    if (!area) return null;
    return (
      <div className="workout-panel__leaf">
        <WorkoutArea
          area={area}
          vault={shared.vault}
          isFocused={shared.focusedAreaId === area.ID}
          isDragging={shared.dragId === area.ID}
          isDropTarget={shared.overAreaId === area.ID}
          onFocus={() => shared.onFocus(area.ID)}
          onDragStart={shared.onDragStart}
          onDragEnter={shared.onDragEnter}
          onDragLeave={shared.onDragLeave}
          onMediaTypeChange={shared.onMediaType}
          onClose={shared.onClose}
          onExternalDrop={shared.onExternalDrop}
        />
      </div>
    );
  }
  return <SplitView node={node} shared={shared} />;
}

// ── SplitView ─────────────────────────────────────────────────────────

function SplitView({ node, shared }: { node: SplitNodeData; shared: SharedProps }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ratio        = shared.splitRatios[node.id] ?? 0.5;
  const isVertical   = node.direction === 'v';

  const handleResize = useCallback((delta: number) => {
    const el   = containerRef.current;
    if (!el) return;
    const size = isVertical ? el.offsetWidth : el.offsetHeight;
    if (size === 0) return;
    const next = Math.max(0.1, Math.min(0.9, ratio + delta / size));
    shared.onSplitRatio(node.id, next);
  }, [isVertical, ratio, node.id, shared]);

  return (
    <div
      ref={containerRef}
      className={`workout-panel__split workout-panel__split--${node.direction}`}
    >
      <div className="workout-panel__split-pane" style={{ flex: ratio }}>
        <LayoutView node={node.first} shared={shared} />
      </div>

      {isVertical
        ? <Splitter onResize={handleResize} />
        : <WorkoutHSplitter onResize={handleResize} />
      }

      <div className="workout-panel__split-pane" style={{ flex: 1 - ratio }}>
        <LayoutView node={node.second} shared={shared} />
      </div>
    </div>
  );
}

// ── WorkoutPanel ──────────────────────────────────────────────────────

interface Props {
  app: TTApplication;
}

export function WorkoutPanel({ app }: Props) {
  const panel = app.WorkoutPanel;
  const vault = app.Models.Vault;
  useAppUpdate(panel);
  useAppUpdate(vault);

  // 設定パネル: どのタイプの設定を表示するか（null = 非表示）
  const [activeSettings,    setActiveSettings]    = useState<SettingsType | null>(null);
  // 外側エッジ D&D
  const [outerDropDir, setOuterDropDir] = useState<DropEdgeDir | null>(null);
  const [settingsPanelWidth, setSettingsPanelWidth] = useState(DEFAULT_SETTINGS_WIDTH);
  // 最後に開いた設定タイプを記憶（トグルボタンで再オープン用）
  const lastSettingsRef = useRef<SettingsType>('workout');

  // split 比率（node.id → 0〜1）
  const [splitRatios, setSplitRatios] = useState<Record<string, number>>({});

  // ドラッグ状態
  const [dragId,      setDragId]     = useState<string | null>(null);
  const [overAreaId,  setOverAreaId] = useState<string | null>(null);
  const overAreaIdRef                = useRef<string | null>(null);

  // Ghost アニメーション
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  const [dragPos,   setDragPos]   = useState<{ x: number; y: number } | null>(null);

  // ── フォーカスペインの Think タイトル ──────────────────────────────
  const focusedArea   = panel.FocusedAreaId ? panel.GetArea(panel.FocusedAreaId) : null;
  const focusedThinkTitle = focusedArea
    ? (vault.GetThink(focusedArea.ResourceID)?.Name ?? '')
    : '';

  // ── ハンドラー ──────────────────────────────────────────────────────

  const handleSetActiveSettings = useCallback((type: SettingsType | null) => {
    if (type !== null) lastSettingsRef.current = type;
    setActiveSettings(type);
  }, []);

  const handleToggle = useCallback(() => {
    setActiveSettings(prev => {
      if (prev !== null) return null;
      return lastSettingsRef.current;
    });
  }, []);

  const handleSettingsResize = useCallback((delta: number) => {
    setSettingsPanelWidth(prev =>
      Math.max(MIN_SETTINGS_WIDTH, Math.min(MAX_SETTINGS_WIDTH, prev + delta))
    );
  }, []);

  const handleFocus = useCallback((areaId: string) => {
    panel.FocusArea(areaId);
  }, [panel]);

  const handleSplitRatio = useCallback((nodeId: string, ratio: number) => {
    setSplitRatios(prev => ({ ...prev, [nodeId]: ratio }));
  }, []);

  // ── エリア分割 (focused pane split) ─────────────────────────────────

  const handleSplitRight = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    if (panel.Layout === null) panel.AddFirst(think.ID, 'texteditor', think.Name);
    else panel.AddRight(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  const handleSplitBelow = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    if (panel.Layout === null) panel.AddFirst(think.ID, 'texteditor', think.Name);
    else panel.AddBelow(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  const handleSplitLeft = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    if (panel.Layout === null) panel.AddFirst(think.ID, 'texteditor', think.Name);
    else panel.AddLeft(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  const handleSplitAbove = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    if (panel.Layout === null) panel.AddFirst(think.ID, 'texteditor', think.Name);
    else panel.AddAbove(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  // ── エリア追加 (panel-level edge addition) ─────────────────────────

  const handleAddRight = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    panel.AddToRight(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  const handleAddBelow = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    panel.AddToBottom(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  const handleAddLeft = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    panel.AddToLeft(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  const handleAddTop = useCallback(async () => {
    const think = await vault.CreateBlankThink('memo', '新規メモ');
    panel.AddToTop(think.ID, 'texteditor', think.Name);
  }, [vault, panel]);

  const handleRemoveFocused = useCallback(() => {
    if (panel.FocusedAreaId) panel.RemoveArea(panel.FocusedAreaId);
  }, [panel]);

  const handleClearAll = useCallback(() => {
    panel.ClearAll();
  }, [panel]);

  // ── 外側エッジ D&D（WorkoutPanel 全体の辺から15px）──────────────────
  const handleOuterDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-thought-id')) return;
    const dir = getEdgeDir(e, e.currentTarget as HTMLElement, 15);
    if (dir) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setOuterDropDir(dir);
    } else {
      setOuterDropDir(null);
    }
  }, []);

  const handleOuterDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOuterDropDir(null);
  }, []);

  const handleOuterDrop = useCallback((e: React.DragEvent) => {
    const id  = e.dataTransfer.getData('application/x-thought-id');
    const dir = getEdgeDir(e, e.currentTarget as HTMLElement, 15);
    setOuterDropDir(null);
    if (!id || !dir) return;
    e.preventDefault();
    const think     = vault.GetThink(id);
    const mediaType = think ? contentTypeToMediaType(think.ContentType) : 'texteditor';
    const title     = think?.Name ?? '';
    if (dir === 'left')  panel.AddToLeft(id,   mediaType, title);
    else if (dir === 'right') panel.AddToRight(id,  mediaType, title);
    else if (dir === 'up')    panel.AddToTop(id,    mediaType, title);
    else                      panel.AddToBottom(id, mediaType, title);
  }, [panel, vault]);

  // ── 各 Pane 内側エッジ D&D（辺から30px → 分割して新エリア追加）────────
  const handleExternalDrop = useCallback((dir: DropEdgeDir, thinkId: string, areaId: string) => {
    const think     = vault.GetThink(thinkId);
    const mediaType = think ? contentTypeToMediaType(think.ContentType) : 'texteditor';
    const title     = think?.Name ?? '';
    panel.FocusArea(areaId);
    if (dir === 'left')  panel.AddLeft(thinkId,  mediaType, title);
    else if (dir === 'right') panel.AddRight(thinkId, mediaType, title);
    else if (dir === 'up')    panel.AddAbove(thinkId, mediaType, title);
    else                      panel.AddBelow(thinkId, mediaType, title);
  }, [panel, vault]);

  const handleDragStart = useCallback((e: React.MouseEvent, areaId: string) => {
    e.preventDefault();
    const area  = panel.GetArea(areaId);
    const title = area?.Title || '（無題）';

    setDragId(areaId);
    setDragTitle(title);
    setDragPos({ x: e.clientX, y: e.clientY });

    const onMouseMove = (ev: MouseEvent) => {
      setDragPos({ x: ev.clientX, y: ev.clientY });
    };
    const onMouseUp = () => {
      const targetId = overAreaIdRef.current;
      if (targetId && targetId !== areaId) panel.SwapAreas(areaId, targetId);
      overAreaIdRef.current = null;
      setDragId(null);
      setOverAreaId(null);
      setDragTitle(null);
      setDragPos(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  }, [panel]);

  const handleDragEnter = useCallback((areaId: string) => {
    if (dragId && dragId !== areaId) {
      overAreaIdRef.current = areaId;
      setOverAreaId(areaId);
    }
  }, [dragId]);

  const handleDragLeave = useCallback(() => {
    overAreaIdRef.current = null;
    setOverAreaId(null);
  }, []);

  const handleMediaType = useCallback((areaId: string, type: MediaType) => {
    panel.SetMediaType(areaId, type);
  }, [panel]);

  const handleClose = useCallback((areaId: string) => {
    panel.RemoveArea(areaId);
  }, [panel]);

  // ── エリアマップ構築 ──────────────────────────────────────────────

  const areaMap = new Map<string, TTWorkoutArea>(panel.Areas.map(a => [a.ID, a]));

  const shared: SharedProps = {
    areas:           areaMap,
    vault,
    focusedAreaId:   panel.FocusedAreaId,
    dragId,
    overAreaId,
    splitRatios,
    onFocus:         handleFocus,
    onDragStart:     handleDragStart,
    onDragEnter:     handleDragEnter,
    onDragLeave:     handleDragLeave,
    onMediaType:     handleMediaType,
    onClose:         handleClose,
    onSplitRatio:    handleSplitRatio,
    onExternalDrop:  handleExternalDrop,
  };

  // ── レンダリング ──────────────────────────────────────────────────

  return (
    <div className="workout-panel">

      {/* ── 左縦リボン ───────────────────────────────────────── */}
      <WorkoutRibbon
        activeSettings={activeSettings}
        thinkTitle={focusedThinkTitle}
        onToggle={handleToggle}
        onSetActiveSettings={handleSetActiveSettings}
      />

      {/* ── 設定パネル + Splitter ────────────────────────────── */}
      <PanelArea
        panelId="workout"
        isOpen={activeSettings !== null}
        width={settingsPanelWidth}
      >
        <WorkoutSettingPanel
          activeSettings={activeSettings ?? lastSettingsRef.current}
          panel={panel}
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
        />
      </PanelArea>
      {activeSettings !== null && (
        <Splitter onResize={handleSettingsResize} />
      )}

      {/* ── コンテンツ領域 ────────────────────────────────────── */}
      <div
        className="workout-panel__body"
        onDragOver={handleOuterDragOver}
        onDragLeave={handleOuterDragLeave}
        onDrop={handleOuterDrop}
      >
        {panel.Layout === null ? (
          <WorkoutAreaEmpty isFullPanel onAdd={handleAddRight} />
        ) : (
          <div className="workout-panel__tree">
            <LayoutView node={panel.Layout} shared={shared} />
          </div>
        )}

        {/* 外側エッジ D&D オーバーレイ（15px）*/}
        {outerDropDir && (
          <div className={`workout-panel__outer-drop workout-panel__outer-drop--${outerDropDir}`} />
        )}
      </div>

      {/* ── ドラッグ Ghost ────────────────────────────────────── */}
      {dragId && dragTitle && dragPos && (
        <div
          className="workout-drag-ghost"
          style={{ left: dragPos.x + 14, top: dragPos.y - 10 }}
        >
          <GripVertical size={12} />
          <span>{dragTitle}</span>
        </div>
      )}

    </div>
  );
}
