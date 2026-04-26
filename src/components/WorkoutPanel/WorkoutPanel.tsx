/**
 * WorkoutPanel.tsx
 * BSP ツリー型レイアウトで WorkoutArea を再帰的にレンダリングする。
 *
 * - AddRight: フォーカスペインを縦分割して右に追加
 * - AddBelow: フォーカスペインを横分割して下に追加
 * - Splitter: ポインターキャプチャ方式（枠外逃げなし）
 * - Drag&Drop: Ghost タイトル追従 + drop target 枠強調
 * - splitRatios: splitNode の id をキーにした 0-1 の比率
 */

import { useCallback, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { TTApplication } from '../../views/TTApplication';
import type { TTWorkoutArea } from '../../views/TTWorkoutArea';
import type { LayoutNode, SplitNodeData } from '../../views/TTWorkoutPanel';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { Splitter } from '../Layout/Splitter';
import { WorkoutHSplitter } from './WorkoutHSplitter';
import { WorkoutArea } from './WorkoutArea';
import { WorkoutAreaEmpty } from './WorkoutAreaEmpty';
import { WorkoutPanelRibbon } from './WorkoutPanelRibbon';
import type { MediaType } from '../../types';
import './WorkoutPanel.css';

// ── shared props（再帰コンポーネントに引き回す）───────────────────────

interface SharedProps {
  areas:          Map<string, TTWorkoutArea>;
  focusedAreaId:  string | null;
  dragId:         string | null;
  overAreaId:     string | null;
  splitRatios:    Record<string, number>;
  onFocus:        (areaId: string) => void;
  onDragStart:    (e: React.MouseEvent, areaId: string) => void;
  onDragEnter:    (areaId: string) => void;
  onDragLeave:    () => void;
  onMediaType:    (areaId: string, type: MediaType) => void;
  onClose:        (areaId: string) => void;
  onSplitRatio:   (nodeId: string, ratio: number) => void;
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
          isFocused={shared.focusedAreaId === area.ID}
          isDragging={shared.dragId === area.ID}
          isDropTarget={shared.overAreaId === area.ID}
          onFocus={() => shared.onFocus(area.ID)}
          onDragStart={shared.onDragStart}
          onDragEnter={shared.onDragEnter}
          onDragLeave={shared.onDragLeave}
          onMediaTypeChange={shared.onMediaType}
          onClose={shared.onClose}
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
  useAppUpdate(panel);

  // split 比率（node.id → 0〜1）
  const [splitRatios, setSplitRatios] = useState<Record<string, number>>({});

  // ドラッグ状態
  const [dragId,      setDragId]     = useState<string | null>(null);
  const [overAreaId,  setOverAreaId] = useState<string | null>(null);
  const overAreaIdRef                = useRef<string | null>(null);

  // Ghost アニメーション
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  const [dragPos,   setDragPos]   = useState<{ x: number; y: number } | null>(null);

  // ── ハンドラー ──────────────────────────────────────────────────────

  const handleFocus = useCallback((areaId: string) => {
    panel.FocusArea(areaId);
  }, [panel]);

  const handleSplitRatio = useCallback((nodeId: string, ratio: number) => {
    setSplitRatios(prev => ({ ...prev, [nodeId]: ratio }));
  }, []);

  const handleAddRight = useCallback(() => {
    const vault      = app.Models.Vault;
    const thinks     = vault.GetThinks().filter(t => t.ContentType !== 'thought');
    const resourceId = thinks[panel.Areas.length % Math.max(thinks.length, 1)]?.ID ?? '';
    const title      = vault.GetThink(resourceId)?.Name ?? '新しいエリア';
    if (panel.Layout === null) {
      panel.AddFirst(resourceId, 'texteditor', title);
    } else {
      panel.AddRight(resourceId, 'texteditor', title);
    }
  }, [app, panel]);

  const handleAddBelow = useCallback(() => {
    const vault      = app.Models.Vault;
    const thinks     = vault.GetThinks().filter(t => t.ContentType !== 'thought');
    const resourceId = thinks[panel.Areas.length % Math.max(thinks.length, 1)]?.ID ?? '';
    const title      = vault.GetThink(resourceId)?.Name ?? '新しいエリア';
    if (panel.Layout === null) {
      panel.AddFirst(resourceId, 'texteditor', title);
    } else {
      panel.AddBelow(resourceId, 'texteditor', title);
    }
  }, [app, panel]);

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
    areas:         areaMap,
    focusedAreaId: panel.FocusedAreaId,
    dragId,
    overAreaId,
    splitRatios,
    onFocus:       handleFocus,
    onDragStart:   handleDragStart,
    onDragEnter:   handleDragEnter,
    onDragLeave:   handleDragLeave,
    onMediaType:   handleMediaType,
    onClose:       handleClose,
    onSplitRatio:  handleSplitRatio,
  };

  // ── レンダリング ──────────────────────────────────────────────────

  return (
    <div className="workout-panel">

      {/* ── パネルリボン ─────────────────────────────────────── */}
      <WorkoutPanelRibbon
        panel={panel}
        onAddRight={handleAddRight}
        onAddBelow={handleAddBelow}
      />

      {/* ── 空状態 ───────────────────────────────────────────── */}
      {panel.Layout === null ? (
        <WorkoutAreaEmpty isFullPanel onAdd={handleAddRight} />
      ) : (

        /* ── BSP ツリーレンダリング ────────────────────────── */
        <div className="workout-panel__tree">
          <LayoutView node={panel.Layout} shared={shared} />
        </div>
      )}

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
