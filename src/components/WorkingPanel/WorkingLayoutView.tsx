/**
 * WorkingLayoutView.tsx
 * WorkingPanel の BSP ツリーを再帰的に描く（葉は WorkingArea、枝は Splitter で2分割）。
 */
import { useCallback, useRef } from 'react';
import type { TTWorkingArea } from '../../views/TTWorkingArea';
import type { TTVault } from '../../models/TTVault';
import type { LayoutNode, SplitNodeData } from '../../views/TTWorkingPanel';
import { Splitter } from '../Layout/Splitter';
import { WorkingHSplitter } from './WorkingHSplitter';
import { WorkingArea } from './WorkingArea';
import type { MediaType } from '../../types';

// ── shared props（再帰コンポーネントに引き回す）───────────────────────

export interface WorkingLayoutShared {
  areas:            Map<string, TTWorkingArea>;
  vault:            TTVault;
  seedsProjectId?:  string;
  focusedAreaId:    string | null;
  dragId:           string | null;
  overAreaId:       string | null;
  splitRatios:      Record<string, number>;
  isExternalDrag:   boolean;
  onFocus:          (areaId: string) => void;
  onDragStart:      (e: React.MouseEvent, areaId: string) => void;
  onDragEnter:      (areaId: string) => void;
  onDragLeave:      () => void;
  onMediaType:      (areaId: string, type: MediaType, rawYaml?: boolean) => void;
  onClose:          (areaId: string) => void;
  /** 境界を動かした量（比率）。両側のまとまりの内部比率はそのままで全体が伸縮する */
  onSplitRatioDelta: (nodeId: string, deltaRatio: number) => void;
}

// ── LayoutView（再帰）───────────────────────────────────────────────────

export function LayoutView({ node, shared }: { node: LayoutNode; shared: WorkingLayoutShared }) {
  if (node.type === 'leaf') {
    const area = shared.areas.get(node.areaId);
    if (!area) return null;
    return (
      <div className="working-panel__leaf">
        <WorkingArea
          key={area.ID}
          area={area}
          vault={shared.vault}
          seedsProjectId={shared.seedsProjectId}
          isFocused={shared.focusedAreaId === area.ID}
          isDragging={shared.dragId === area.ID}
          isDropTarget={shared.overAreaId === area.ID}
          isExternalDrag={shared.isExternalDrag}
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

function SplitView({ node, shared }: { node: SplitNodeData; shared: WorkingLayoutShared }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ratio        = shared.splitRatios[node.id] ?? 0.5;
  const isVertical   = node.direction === 'v';

  const handleResize = useCallback((delta: number) => {
    const el   = containerRef.current;
    if (!el) return;
    // flex で比率配分されるのは Splitter 自身の幅を除いた部分なので、それを分母にしてカーソルに追従させる
    const splitter = el.children[1] as HTMLElement | undefined;
    const splitterSize = splitter ? (isVertical ? splitter.offsetWidth : splitter.offsetHeight) : 0;
    const size = (isVertical ? el.offsetWidth : el.offsetHeight) - splitterSize;
    if (size <= 0) return;
    // 再描画前に次の pointermove が来ても移動量を取りこぼさないよう、最新の比率に足し込む
    shared.onSplitRatioDelta(node.id, delta / size);
  }, [isVertical, node.id, shared]);

  return (
    <div
      ref={containerRef}
      className={`working-panel__split working-panel__split--${node.direction}`}
    >
      <div className="working-panel__split-pane" style={{ flex: ratio }}>
        <LayoutView node={node.first} shared={shared} />
      </div>

      {isVertical
        ? <Splitter onResize={handleResize} />
        : <WorkingHSplitter onResize={handleResize} />
      }

      <div className="working-panel__split-pane" style={{ flex: 1 - ratio }}>
        <LayoutView node={node.second} shared={shared} />
      </div>
    </div>
  );
}
