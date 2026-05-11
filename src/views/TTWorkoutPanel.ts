/**
 * TTWorkoutPanel.ts
 * WorkoutArea 群を BSP ツリーで管理するビューモデル。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTWorkoutArea } from './TTWorkoutArea';
import type { MediaType } from '../types';

export type WorkoutViewMode = 'workout' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph';

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

export function collectAreaIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.areaId];
  return [...collectAreaIds(node.first), ...collectAreaIds(node.second)];
}

export function addToFocused(
  node: LayoutNode,
  focusedAreaId: string,
  newAreaId: string,
  direction: 'v' | 'h',
  position: 'first' | 'second' = 'second',
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.areaId !== focusedAreaId) return node;
    const newLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: newAreaId };
    return {
      id: newNodeId(),
      type: 'split',
      direction,
      first:  position === 'first'  ? newLeaf : node,
      second: position === 'second' ? newLeaf : node,
    } satisfies SplitNodeData;
  }
  const newFirst  = addToFocused(node.first,  focusedAreaId, newAreaId, direction, position);
  const newSecond = addToFocused(node.second, focusedAreaId, newAreaId, direction, position);
  if (newFirst === node.first && newSecond === node.second) return node;
  return { ...node, first: newFirst, second: newSecond };
}

export function removeLeaf(
  node: LayoutNode,
  areaId: string,
): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.areaId === areaId ? null : node;
  }
  if (node.first.type === 'leaf' && node.first.areaId === areaId) return node.second;
  if (node.second.type === 'leaf' && node.second.areaId === areaId) return node.first;

  const newFirst  = removeLeaf(node.first,  areaId);
  const newSecond = removeLeaf(node.second, areaId);
  if (newFirst === null)  return node.second;
  if (newSecond === null) return node.first;
  if (newFirst === node.first && newSecond === node.second) return node;
  return { ...node, first: newFirst, second: newSecond };
}

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

export class TTWorkoutPanel extends TTUIItem {
  public Areas: TTWorkoutArea[] = [];
  public Layout: LayoutNode | null = null;
  public FocusedAreaId: string | null = null;

  public override get ClassName(): string { return 'TTWorkoutPanel'; }

  constructor() {
    super();
    this.ID   = 'WorkoutPanel';
    this.Name = 'WorkoutPanel';
  }

  // ── 表示モード ────────────────────────────────────────────────────────
  /** 設定パネルの表示モード */
  public ViewMode: WorkoutViewMode = 'workout';

  public SetViewMode(mode: WorkoutViewMode): void {
    this.ViewMode = mode;
    this.NotifyUpdated();
  }

  // ── エリア表示 ────────────────────────────────────────────────────────
  public IsAreaOpen: boolean = true;

  public ToggleArea(): void { this.IsAreaOpen = !this.IsAreaOpen; this.NotifyUpdated(); }
  public OpenArea():   void { if (!this.IsAreaOpen) { this.IsAreaOpen = true;  this.NotifyUpdated(); } }
  public CloseArea():  void { if (this.IsAreaOpen)  { this.IsAreaOpen = false; this.NotifyUpdated(); } }

  // ── TextEditor 設定 ───────────────────────────────────────────────────
  public EditorLineNumbers: boolean = false;
  public EditorWordWrap: boolean = true;
  public EditorMinimap: boolean = false;
  public EditorShowFullWidthSpace: boolean = false;
  public EditorUnicodeHighlight: boolean = false;
  public EditorBracketPairColorization: boolean = true;
  public EditorHighlightWord: string = '';
  public EditorHighlightHistory: string[] = [];

  public EditorBackground: string = '#f5f5f5';
  public EditorForeground: string = '#1e1e1e';
  public EditorHeadingStyles: { color: string; bold: boolean; underline: boolean }[] = [
    { color: '#569cd6', bold: true, underline: false }, // H1
    { color: '#4ec9b0', bold: true, underline: false }, // H2
    { color: '#ce9178', bold: true, underline: false }, // H3
    { color: '#dcdcaa', bold: true, underline: false }, // H4
    { color: '#c586c0', bold: true, underline: false }, // H5
  ];

  public EditorHighlightStyles: { backgroundColor: string; color: string }[] = [
    { backgroundColor: '#fff0b3', color: '#1a1a1a' }, 
    { backgroundColor: '#ffb3b3', color: '#1a1a1a' }, 
    { backgroundColor: '#b3e0ff', color: '#1a1a1a' }, 
    { backgroundColor: '#b3ffb3', color: '#1a1a1a' }, 
    { backgroundColor: '#e6b3ff', color: '#1a1a1a' }, 
  ];

  public SetEditorLineNumbers(v: boolean) { this.EditorLineNumbers = v; this.NotifyUpdated(); }
  public SetEditorWordWrap(v: boolean) { this.EditorWordWrap = v; this.NotifyUpdated(); }
  public SetEditorMinimap(v: boolean) { this.EditorMinimap = v; this.NotifyUpdated(); }
  public SetEditorShowFullWidthSpace(v: boolean) { this.EditorShowFullWidthSpace = v; this.NotifyUpdated(); }
  public SetEditorUnicodeHighlight(v: boolean) { this.EditorUnicodeHighlight = v; this.NotifyUpdated(); }
  public SetEditorBracketPairColorization(v: boolean) { this.EditorBracketPairColorization = v; this.NotifyUpdated(); }
  public SetEditorHighlightWord(v: string) { this.EditorHighlightWord = v; this.NotifyUpdated(); }
  public AddEditorHighlightHistory(v: string) {
    if (!v.trim()) return;
    this.EditorHighlightHistory = [v, ...this.EditorHighlightHistory.filter(h => h !== v)].slice(0, 10);
    this.NotifyUpdated();
  }

  public SetEditorBackground(color: string) { this.EditorBackground = color; this.NotifyUpdated(); }
  public SetEditorForeground(color: string) { this.EditorForeground = color; this.NotifyUpdated(); }
  public SetEditorHeadingStyle(level: number, style: { color?: string; bold?: boolean; underline?: boolean }) {
    if (level < 1 || level > 5) return;
    this.EditorHeadingStyles = this.EditorHeadingStyles.map((s, i) => i === level - 1 ? { ...s, ...style } : s);
    this.NotifyUpdated();
  }
  public SetEditorHighlightStyle(groupIndex: number, style: Partial<{ backgroundColor: string; color: string }>) {
    if (groupIndex >= 0 && groupIndex <= 4) {
      this.EditorHighlightStyles = this.EditorHighlightStyles.map((s, i) => i === groupIndex ? { ...s, ...style } : s);
      this.NotifyUpdated();
    }
  }

  // ── Area CRUD ──────────────────────────────────────────────────────────

  public AddFirst(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea {
    const area = this._createArea(resourceId, mediaType, title);
    if (this.Layout === null) {
      this.Layout = { id: newNodeId(), type: 'leaf', areaId: area.ID };
    } else {
      const focusId = this.FocusedAreaId ?? collectAreaIds(this.Layout)[0];
      this.Layout = addToFocused(this.Layout, focusId, area.ID, 'v');
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddRight(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    const focusId = this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null);
    if (!focusId || !this.Layout) return null;
    const area = this._createArea(resourceId, mediaType, title);
    this.Layout = addToFocused(this.Layout, focusId, area.ID, 'v');
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddBelow(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    const focusId = this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null);
    if (!focusId || !this.Layout) return null;
    const area = this._createArea(resourceId, mediaType, title);
    this.Layout = addToFocused(this.Layout, focusId, area.ID, 'h');
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddLeft(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    const focusId = this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null);
    if (!focusId || !this.Layout) return null;
    const area = this._createArea(resourceId, mediaType, title);
    this.Layout = addToFocused(this.Layout, focusId, area.ID, 'v', 'first');
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddAbove(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    const focusId = this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null);
    if (!focusId || !this.Layout) return null;
    const area = this._createArea(resourceId, mediaType, title);
    this.Layout = addToFocused(this.Layout, focusId, area.ID, 'h', 'first');
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddToLeft(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea {
    const area = this._createArea(resourceId, mediaType, title);
    const newLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: area.ID };
    if (this.Layout === null) {
      this.Layout = newLeaf;
    } else {
      this.Layout = { id: newNodeId(), type: 'split', direction: 'v', first: newLeaf, second: this.Layout };
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddToRight(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea {
    const area = this._createArea(resourceId, mediaType, title);
    const newLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: area.ID };
    if (this.Layout === null) {
      this.Layout = newLeaf;
    } else {
      this.Layout = { id: newNodeId(), type: 'split', direction: 'v', first: this.Layout, second: newLeaf };
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddToTop(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea {
    const area = this._createArea(resourceId, mediaType, title);
    const newLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: area.ID };
    if (this.Layout === null) {
      this.Layout = newLeaf;
    } else {
      this.Layout = { id: newNodeId(), type: 'split', direction: 'h', first: newLeaf, second: this.Layout };
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddToBottom(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea {
    const area = this._createArea(resourceId, mediaType, title);
    const newLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: area.ID };
    if (this.Layout === null) {
      this.Layout = newLeaf;
    } else {
      this.Layout = { id: newNodeId(), type: 'split', direction: 'h', first: this.Layout, second: newLeaf };
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public RemoveArea(areaId: string): void {
    this.Areas = this.Areas.filter(a => a.ID !== areaId);
    if (this.Layout) {
      this.Layout = removeLeaf(this.Layout, areaId);
    }
    if (this.FocusedAreaId === areaId) {
      this.FocusedAreaId = this.Layout ? (collectAreaIds(this.Layout)[0] ?? null) : null;
    }
    this.NotifyUpdated();
  }

  public GetArea(areaId: string): TTWorkoutArea | undefined {
    return this.Areas.find(a => a.ID === areaId);
  }

  // ── フォーカス ─────────────────────────────────────────────────────────
  public FocusArea(areaId: string): void {
    if (this.FocusedAreaId === areaId) return;
    if (!this.Areas.find(a => a.ID === areaId)) return;
    this.FocusedAreaId = areaId;
    this.NotifyUpdated();
  }

  public FocusExistingResource(resourceId: string): boolean {
    const existing = this.Areas.find(a => a.ResourceID === resourceId);
    if (!existing) return false;
    this.FocusArea(existing.ID);
    return true;
  }

  public ReplaceFocused(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    const focusId = this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null);
    const area = focusId ? this.Areas.find(a => a.ID === focusId) : null;
    if (!area) return null;
    area.OpenThink(resourceId, mediaType, title);
    this.NotifyUpdated();
    return area;
  }

  public SwapAreas(fromId: string, toId: string): void {
    if (!this.Layout || fromId === toId) return;
    this.Layout = swapLeafs(this.Layout, fromId, toId);
    this.NotifyUpdated();
  }

  public SetMediaType(areaId: string, mediaType: MediaType): void {
    const area = this.GetArea(areaId);
    if (!area) return;
    area.MediaType = mediaType;
    this.NotifyUpdated();
  }

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
    // 配列の更新もイミュータブルに行う
    this.Areas = [...this.Areas, area];
    return area;
  }
}
