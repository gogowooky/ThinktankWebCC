// Workout パネルの BSPツリー管理（仕様書02 §2, §3, §4, §5）

import { TTObject } from '../models/TTObject';
import { TTWorkoutArea } from './TTWorkoutArea';
import type { LayoutNode, SplitNodeData, MediaType } from '../types';

let nodeSeq = 0;
const newNodeId = () => `node-${Date.now()}-${nodeSeq++}`;

export type AddEdge = 'left' | 'right' | 'top' | 'bottom';
export type SplitSide = 'left' | 'right' | 'up' | 'down';

export class TTWorkoutPanel extends TTObject {
  Layout: LayoutNode | null = null;
  private _areas = new Map<string, TTWorkoutArea>();
  /** split ノードID → 比率（0.1〜0.9） */
  SplitRatios = new Map<string, number>();
  /** 最後にフォーカスされたエリア */
  FocusedAreaId = '';

  GetArea(areaId: string): TTWorkoutArea | undefined {
    return this._areas.get(areaId);
  }

  get Areas(): TTWorkoutArea[] {
    return [...this._areas.values()];
  }

  get LeafCount(): number {
    return this._countLeaves(this.Layout);
  }

  private _countLeaves(node: LayoutNode | null): number {
    if (!node) return 0;
    if (node.type === 'leaf') return 1;
    return this._countLeaves(node.first) + this._countLeaves(node.second);
  }

  private _newArea(resourceId: string, media: MediaType): TTWorkoutArea {
    const area = new TTWorkoutArea();
    area._parent = this;
    area.SetResource(resourceId, media);
    this._areas.set(area.ID, area);
    return area;
  }

  private _leaf(area: TTWorkoutArea): LayoutNode {
    return { id: newNodeId(), type: 'leaf', areaId: area.ID };
  }

  GetRatio(nodeId: string): number {
    return this.SplitRatios.get(nodeId) ?? 0.5;
  }

  SetRatio(nodeId: string, ratio: number): void {
    this.SplitRatios.set(nodeId, Math.min(0.9, Math.max(0.1, ratio)));
    this.NotifyUpdated(false);
  }

  /** 外縁追加: パネル全体の指定辺に新ペインを追加（仕様書02 §3.2 ケースB） */
  AddToEdge(edge: AddEdge, resourceId: string, media: MediaType): TTWorkoutArea {
    const area = this._newArea(resourceId, media);
    const leaf = this._leaf(area);
    if (!this.Layout) {
      this.Layout = leaf;
    } else {
      const direction = edge === 'left' || edge === 'right' ? 'v' : 'h';
      const firstIsNew = edge === 'left' || edge === 'top';
      const split: SplitNodeData = {
        id: newNodeId(),
        type: 'split',
        direction,
        first: firstIsNew ? leaf : this.Layout,
        second: firstIsNew ? this.Layout : leaf,
      };
      // 新規ペインのデフォルト比率 35%
      this.SplitRatios.set(split.id, firstIsNew ? 0.35 : 0.65);
      this.Layout = split;
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated(false);
    return area;
  }

  /** 内側分割: 指定エリアを2分割して新ペインを追加（仕様書02 §3.2 ケースC） */
  SplitArea(targetAreaId: string, side: SplitSide, resourceId: string, media: MediaType): TTWorkoutArea {
    const area = this._newArea(resourceId, media);
    const leaf = this._leaf(area);
    const replace = (node: LayoutNode): LayoutNode => {
      if (node.type === 'leaf') {
        if (node.areaId !== targetAreaId) return node;
        const direction = side === 'left' || side === 'right' ? 'v' : 'h';
        const firstIsNew = side === 'left' || side === 'up';
        const split: SplitNodeData = {
          id: newNodeId(),
          type: 'split',
          direction,
          first: firstIsNew ? leaf : node,
          second: firstIsNew ? node : leaf,
        };
        this.SplitRatios.set(split.id, 0.5);
        return split;
      }
      return { ...node, first: replace(node.first), second: replace(node.second) };
    };
    if (this.Layout) this.Layout = replace(this.Layout);
    else this.Layout = leaf;
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated(false);
    return area;
  }

  CloseArea(areaId: string): void {
    const remove = (node: LayoutNode): LayoutNode | null => {
      if (node.type === 'leaf') {
        return node.areaId === areaId ? null : node;
      }
      const first = remove(node.first);
      const second = remove(node.second);
      if (first && second) return { ...node, first, second };
      this.SplitRatios.delete(node.id);
      return first ?? second;
    };
    if (this.Layout) this.Layout = remove(this.Layout);
    this._areas.delete(areaId);
    if (this.FocusedAreaId === areaId) {
      this.FocusedAreaId = this.Areas[0]?.ID ?? '';
    }
    this.NotifyUpdated(false);
  }

  /** ペイン同士の入れ替え（仕様書02 §4） */
  SwapAreas(fromId: string, toId: string): void {
    if (fromId === toId) return;
    const swap = (node: LayoutNode): LayoutNode => {
      if (node.type === 'leaf') {
        if (node.areaId === fromId) return { ...node, areaId: toId };
        if (node.areaId === toId) return { ...node, areaId: fromId };
        return node;
      }
      return { ...node, first: swap(node.first), second: swap(node.second) };
    };
    if (this.Layout) this.Layout = swap(this.Layout);
    this.NotifyUpdated(false);
  }

  /** 幅・高さの均等化（仕様書02 §5）。target: 'v'=幅均等化, 'h'=高さ均等化 */
  Equalize(target: 'v' | 'h'): void {
    const slots = (node: LayoutNode): number => {
      if (node.type === 'leaf') return 1;
      const f = slots(node.first);
      const s = slots(node.second);
      return node.direction === target ? f + s : Math.max(f, s);
    };
    const apply = (node: LayoutNode): void => {
      if (node.type !== 'split') return;
      if (node.direction === target) {
        const f = slots(node.first);
        const s = slots(node.second);
        this.SplitRatios.set(node.id, f / (f + s));
      }
      apply(node.first);
      apply(node.second);
    };
    if (this.Layout) apply(this.Layout);
    this.NotifyUpdated(false);
  }

  FindAreaByResource(resourceId: string): TTWorkoutArea | undefined {
    return this.Areas.find((a) => a.ResourceID === resourceId);
  }

  SetFocusedArea(areaId: string): void {
    if (this.FocusedAreaId === areaId) return;
    this.FocusedAreaId = areaId;
    this.NotifyUpdated(false);
  }
}
