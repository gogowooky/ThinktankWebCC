/**
 * TTWorkoutPanel.ts
 * WorkoutArea 群を BSP ツリーで管理するビューモデル。
 *
 * レイアウト構造:
 *   LayoutNode = LeafNode | SplitNodeData
 *   LeafNode   … 単一の WorkoutArea を表示
 *   SplitNode  … 2 つの子ノードを縦（v）または横（h）に分割
 *
 * 操作:
 *   AddFirst  … 最初のエリアを追加（Layout = LeafNode）
 *   AddRight  … フォーカスペインを縦分割して右に追加
 *   AddBelow  … フォーカスペインを横分割して下に追加
 *   RemoveArea … エリア削除 + ツリー縮小
 *   FocusArea  … フォーカス切り替え
 *   SwapAreas  … ドラッグ&ドロップでペイン内容を交換
 */

import { TTObject } from '../models/TTObject';
import { TTWorkoutArea } from './TTWorkoutArea';
import type { MediaType } from '../types';

// ── BSP ノード型 ──────────────────────────────────────────────────────

export interface LeafNode {
  id: string;
  type: 'leaf';
  areaId: string;
}

export interface SplitNodeData {
  id: string;
  type: 'split';
  direction: 'v' | 'h';  // v=縦分割（左右）, h=横分割（上下）
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = LeafNode | SplitNodeData;

// ── ノード ID 生成 ────────────────────────────────────────────────────

let _nodeCounter = 0;
function newNodeId(): string {
  return `node-${++_nodeCounter}-${Date.now()}`;
}

// ── 純粋ツリー操作関数 ────────────────────────────────────────────────

/** ツリー内のすべての areaId を収集する */
export function collectAreaIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.areaId];
  return [...collectAreaIds(node.first), ...collectAreaIds(node.second)];
}

/**
 * focusedAreaId を持つ LeafNode を分割して新しい LeafNode を追加する。
 * direction: 'v' = 縦分割（右に追加）, 'h' = 横分割（下に追加）
 */
export function addToFocused(
  node: LayoutNode,
  focusedAreaId: string,
  newAreaId: string,
  direction: 'v' | 'h',
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.areaId !== focusedAreaId) return node;
    // このリーフを分割する
    const newLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: newAreaId };
    return {
      id: newNodeId(),
      type: 'split',
      direction,
      first: node,
      second: newLeaf,
    } satisfies SplitNodeData;
  }
  // split node: 再帰的に探す
  const newFirst  = addToFocused(node.first,  focusedAreaId, newAreaId, direction);
  const newSecond = addToFocused(node.second, focusedAreaId, newAreaId, direction);
  if (newFirst === node.first && newSecond === node.second) return node;
  return { ...node, first: newFirst, second: newSecond };
}

/**
 * areaId を持つ LeafNode をツリーから削除し、兄弟ノードで置き換える。
 * ルートを削除した場合は null を返す。
 */
export function removeLeaf(
  node: LayoutNode,
  areaId: string,
): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.areaId === areaId ? null : node;
  }
  // split node
  if (node.first.type === 'leaf' && node.first.areaId === areaId) return node.second;
  if (node.second.type === 'leaf' && node.second.areaId === areaId) return node.first;

  const newFirst  = removeLeaf(node.first,  areaId);
  const newSecond = removeLeaf(node.second, areaId);
  if (newFirst === null)  return node.second;
  if (newSecond === null) return node.first;
  if (newFirst === node.first && newSecond === node.second) return node;
  return { ...node, first: newFirst, second: newSecond };
}

/**
 * 2 つの LeafNode の areaId を交換する（ドラッグ&ドロップ）。
 */
export function swapLeafs(
  node: LayoutNode,
  fromAreaId: string,
  toAreaId: string,
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.areaId === fromAreaId) return { ...node, areaId: toAreaId };
    if (node.areaId === toAreaId)   return { ...node, areaId: fromAreaId };
    return node;
  }
  const newFirst  = swapLeafs(node.first,  fromAreaId, toAreaId);
  const newSecond = swapLeafs(node.second, fromAreaId, toAreaId);
  if (newFirst === node.first && newSecond === node.second) return node;
  return { ...node, first: newFirst, second: newSecond };
}

// ── TTWorkoutPanel ────────────────────────────────────────────────────

export class TTWorkoutPanel extends TTObject {
  /** WorkoutArea 一覧 */
  public Areas: TTWorkoutArea[] = [];

  /** BSP レイアウトツリー（null = エリアなし）*/
  public Layout: LayoutNode | null = null;

  /** 現在フォーカスされている areaId（null = なし）*/
  public FocusedAreaId: string | null = null;

  public override get ClassName(): string {
    return 'TTWorkoutPanel';
  }

  constructor() {
    super();
    this.ID   = 'WorkoutPanel';
    this.Name = 'WorkoutPanel';
  }

  // ── Area CRUD ──────────────────────────────────────────────────────────

  /** 最初のエリアを追加（Layout がある場合は右分割） */
  public AddFirst(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea {
    const area = this._createArea(resourceId, mediaType, title);
    if (this.Layout === null) {
      this.Layout = { id: newNodeId(), type: 'leaf', areaId: area.ID };
    } else {
      // 既にレイアウトがある場合はフォーカスペインの右に追加
      this.Layout = addToFocused(this.Layout, this.FocusedAreaId ?? collectAreaIds(this.Layout)[0], area.ID, 'v');
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  /** フォーカスペインを縦分割して右にエリアを追加 */
  public AddRight(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    const focusId = this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null);
    if (!focusId || !this.Layout) return null;

    const area = this._createArea(resourceId, mediaType, title);
    this.Layout = addToFocused(this.Layout, focusId, area.ID, 'v');
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  /** フォーカスペインを横分割して下にエリアを追加 */
  public AddBelow(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    const focusId = this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null);
    if (!focusId || !this.Layout) return null;

    const area = this._createArea(resourceId, mediaType, title);
    this.Layout = addToFocused(this.Layout, focusId, area.ID, 'h');
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  /** 指定 ID の Area を削除し、ツリーを縮小する */
  public RemoveArea(areaId: string): void {
    this.Areas = this.Areas.filter(a => a.ID !== areaId);
    if (this.Layout) {
      this.Layout = removeLeaf(this.Layout, areaId);
    }
    // フォーカスが消えたら残存エリアの先頭へ
    if (this.FocusedAreaId === areaId) {
      this.FocusedAreaId = this.Layout ? (collectAreaIds(this.Layout)[0] ?? null) : null;
    }
    this.NotifyUpdated();
  }

  /** ID で Area を取得する */
  public GetArea(areaId: string): TTWorkoutArea | undefined {
    return this.Areas.find(a => a.ID === areaId);
  }

  // ── フォーカス ─────────────────────────────────────────────────────────

  /** フォーカスエリアを設定する */
  public FocusArea(areaId: string): void {
    if (this.FocusedAreaId === areaId) return;
    if (!this.Areas.find(a => a.ID === areaId)) return;
    this.FocusedAreaId = areaId;
    this.NotifyUpdated();
  }

  // ── ドラッグ移動 ────────────────────────────────────────────────────────

  /** 2 つのペイン内容を入れ替える（ドラッグ&ドロップ完了時に呼ぶ）*/
  public SwapAreas(fromId: string, toId: string): void {
    if (!this.Layout || fromId === toId) return;
    this.Layout = swapLeafs(this.Layout, fromId, toId);
    this.NotifyUpdated();
  }

  // ── MediaType 変更 ─────────────────────────────────────────────────────

  /** エリアのメディアタイプを変更する */
  public SetMediaType(areaId: string, mediaType: MediaType): void {
    const area = this.GetArea(areaId);
    if (!area) return;
    area.MediaType = mediaType;
    this.NotifyUpdated();
  }

  // ── クリア ────────────────────────────────────────────────────────────

  /** 全 Area をクリアする */
  public ClearAll(): void {
    this.Areas         = [];
    this.Layout        = null;
    this.FocusedAreaId = null;
    this.NotifyUpdated();
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────

  private _createArea(resourceId: string, mediaType: MediaType, title: string): TTWorkoutArea {
    const area   = new TTWorkoutArea();
    area._parent = this;
    area.OpenThink(resourceId, mediaType, title);
    this.Areas.push(area);
    return area;
  }
}
