/**
 * TTWorkoutPanel.ts
 * WorkoutArea 群を BSP ツリーで管理するビューモデル。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTWorkoutArea } from './TTWorkoutArea';
import type { MediaType } from '../types';

export type WorkoutViewMode = 'workout' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph';

// ── TextEditorSettings ────────────────────────────────────────────────────

export type SectionStyle = { color: string; bgColor?: string; bold: boolean; underline: boolean };

export const SECTION_STYLE_DEFAULTS: SectionStyle[] = [
  { color: '#569cd6', bold: true, underline: false },
  { color: '#4ec9b0', bold: true, underline: false },
  { color: '#ce9178', bold: true, underline: false },
  { color: '#dcdcaa', bold: true, underline: false },
  { color: '#c586c0', bold: true, underline: false },
];

export type HighlightStyle = { backgroundColor: string; color: string; bold?: boolean; underline?: boolean };

export const HIGHLIGHT_STYLE_DEFAULTS: HighlightStyle[] = [
  { backgroundColor: '#fff0b3', color: 'undefined', bold: false, underline: false },
  { backgroundColor: '#ffb3b3', color: 'undefined', bold: false, underline: false },
  { backgroundColor: '#b3e0ff', color: 'undefined', bold: false, underline: false },
  { backgroundColor: '#b3ffb3', color: 'undefined', bold: false, underline: false },
  { backgroundColor: '#e6b3ff', color: 'undefined', bold: false, underline: false },
  { backgroundColor: '#e620ff', color: 'undefined', bold: false, underline: false },
];

export class TextEditorSettings {
  LineNumbers = { IsVisible: false };
  WordWrap = { IsVisible: true };
  Minimap = { IsVisible: false };
  FullWidthSpace = { IsVisible: false };
  UnicodeHighlight = { IsVisible: false };
  BracketPairColorization = { IsVisible: true };

  CurrentFoldingHeadingOffset = '0';
  CurrentFoldingHeadingNumber = 'None';
  CurrentEditorCursorPos = '0';
  CurrentEditorTextOnCursorPos = '';

  Bullet: Record<string, any> = {
    StyleNum: 9,
    Style1: "・,undefined,undefined",
    Style2: "-,undefined,undefined",
    Style3: "*,#cc2222,undefined",
    Style4: "■,#000000,underline",
    Style5: "●,#000000,underline",
    Style6: "=,#cccc22,undefined",
    Style7: "↓,#000000,bold",
    Style8: "→,undefined,underline",
    Style9: "[✓],undefined,bold",
    Style10: '', Style11: '', Style12: '', Style13: '', Style14: '', Style15: '', Style16: '', Style17: '', Style18: '', Style19: '', Style20: ''
  };
  Comment: Record<string, any> = {
    StyleNum: 5,
    Style1: ">,#bbddbb,undefined",
    Style2: ">>,#bbbbdd,undefined",
    Style3: ">>>,#ddbbbb,undefined",
    Style4: ";,#bbbbbb,undefined",
    Style5: "|,#ffaaaa,undefined",
    Style6: '', Style7: '', Style8: '', Style9: '', Style10: '', Style11: '', Style12: '', Style13: '', Style14: '', Style15: '', Style16: '', Style17: '', Style18: '', Style19: '', Style20: ''
  };

  Color = { Background: '#f5f5f5', Text: '#1e1e1e', Selection: '#c6e6c6ff', Occurrence: '#aac6aaff' };
  HeadingStyles: SectionStyle[]   = [...SECTION_STYLE_DEFAULTS];
  HighlightStyles: HighlightStyle[] = [...HIGHLIGHT_STYLE_DEFAULTS];
  UrlStyle: SectionStyle = { color: '#1010edff', bold: false, underline: true };
  FilepathStyle: SectionStyle = { color: 'undefined', bold: false, underline: true };
  TagStyle: SectionStyle = { color: '#4ba402ff', bold: true, underline: true };



  HighlightStyleKey: string = 'WorkoutPanel.HighlightStyle.Preset1';
  HighlightPresets: Record<string, HighlightStyle[]> = {
    'WorkoutPanel.HighlightStyle.Preset1': [...HIGHLIGHT_STYLE_DEFAULTS],
    'WorkoutPanel.HighlightStyle.Preset2': [...HIGHLIGHT_STYLE_DEFAULTS],
    'WorkoutPanel.HighlightStyle.Preset3': [...HIGHLIGHT_STYLE_DEFAULTS],
    'WorkoutPanel.HighlightStyle.Preset4': [...HIGHLIGHT_STYLE_DEFAULTS],
    'WorkoutPanel.HighlightStyle.Preset5': [...HIGHLIGHT_STYLE_DEFAULTS],
  };
}

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

  /** ToolBar の表示モード */
  public ToolBarMode: string = 'Copyright';

  /** ToolBar StatusMode用テキスト (CSV形式) */
  public StatusModeText: string = 'ThinktankPanel.Mode.Name,OverviewPanel.Mode.Name,WorkoutSettingPanel.Mode.Name';

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
  public TextEditor: TextEditorSettings = new TextEditorSettings();

  // ── ハイライト設定（全Pane共通） ─────────────────────────────────────────
  public HighlightWord: string = '';
  public HighlightHistory: string[] = [];

  public SetHighlightWord(v: string) { this.HighlightWord = v; this.NotifyUpdated(); }
  public AddHighlightHistory(v: string) {
    if (!v.trim()) return;
    this.HighlightHistory = [v, ...this.HighlightHistory.filter(h => h !== v)].slice(0, 10);
    this.NotifyUpdated();
  }

  // ── コマンド・翻訳・リマインダーテキスト設定 ──────────────────────────────────────
  public CommandText: string = '';
  public TranslateText: string = '';
  public ReminderText: string = '';

  public SetCommandText(v: string) { this.CommandText = v; this.NotifyUpdated(); }
  public SetTranslateText(v: string) { this.TranslateText = v; this.NotifyUpdated(); }
  public SetReminderText(v: string) { this.ReminderText = v; this.NotifyUpdated(); }

  // ── TextEditor ヘルパーメソッド ─────────────────────────────────────────
  public SetTextEditorLineNumbersVisible(v: boolean) { this.TextEditor.LineNumbers.IsVisible = v; this.NotifyUpdated(); }
  public SetTextEditorWordWrapVisible(v: boolean) { this.TextEditor.WordWrap.IsVisible = v; this.NotifyUpdated(); }
  public SetTextEditorMinimapVisible(v: boolean) { this.TextEditor.Minimap.IsVisible = v; this.NotifyUpdated(); }
  public SetTextEditorFullWidthSpaceVisible(v: boolean) { this.TextEditor.FullWidthSpace.IsVisible = v; this.NotifyUpdated(); }
  public SetTextEditorUnicodeHighlightVisible(v: boolean) { this.TextEditor.UnicodeHighlight.IsVisible = v; this.NotifyUpdated(); }
  public SetTextEditorBracketPairColorizationVisible(v: boolean) { this.TextEditor.BracketPairColorization.IsVisible = v; this.NotifyUpdated(); }

  public SetTextEditorColorBackground(color: string)  { this.TextEditor.Color.Background  = color; this.NotifyUpdated(); }
  public SetTextEditorColorText(color: string)        { this.TextEditor.Color.Text        = color; this.NotifyUpdated(); }
  public SetTextEditorColorSelection(color: string)   { this.TextEditor.Color.Selection   = color; this.NotifyUpdated(); }
  public SetTextEditorColorOccurrence(color: string)  { this.TextEditor.Color.Occurrence  = color; this.NotifyUpdated(); }
  public SetTextEditorHeadingStyle(level: number, style: { color?: string; bgColor?: string; bold?: boolean; underline?: boolean }) {
    if (level < 1 || level > 5) return;
    this.TextEditor.HeadingStyles = this.TextEditor.HeadingStyles.map((s, i) => i === level - 1 ? { ...s, ...style } : s);
    this.NotifyUpdated();
  }
  public SetTextEditorHighlightStyle(groupIndex: number, style: Partial<{ backgroundColor: string; color: string; bold: boolean; underline: boolean }>) {
    if (groupIndex >= 0 && groupIndex <= 5) {
      this.TextEditor.HighlightStyles = this.TextEditor.HighlightStyles.map((s, i) => i === groupIndex ? { ...s, ...style } : s);
      this.NotifyUpdated();
    }
  }
  public SetTextEditorUrlStyle(style: Partial<SectionStyle>) {
    this.TextEditor.UrlStyle = { ...this.TextEditor.UrlStyle, ...style };
    this.NotifyUpdated();
  }
  public SetTextEditorFilepathStyle(style: Partial<SectionStyle>) {
    this.TextEditor.FilepathStyle = { ...this.TextEditor.FilepathStyle, ...style };
    this.NotifyUpdated();
  }
  public SetTextEditorTagStyle(style: Partial<SectionStyle>) {
    this.TextEditor.TagStyle = { ...this.TextEditor.TagStyle, ...style };
    this.NotifyUpdated();
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

  public MoveArea(
    fromId: string,
    toId: string | null,
    dir: 'left' | 'right' | 'up' | 'down',
    type: 'add' | 'split',
  ): void {
    if (!this.Layout || fromId === toId) return;
    const newLayout = removeLeaf(this.Layout, fromId);
    if (newLayout === null) return;
    this.Layout = newLayout;
    const fromLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: fromId };
    if (type === 'add' || !toId) {
      if (dir === 'left')       this.Layout = { id: newNodeId(), type: 'split', direction: 'v', first: fromLeaf, second: this.Layout };
      else if (dir === 'right') this.Layout = { id: newNodeId(), type: 'split', direction: 'v', first: this.Layout, second: fromLeaf };
      else if (dir === 'up')    this.Layout = { id: newNodeId(), type: 'split', direction: 'h', first: fromLeaf, second: this.Layout };
      else                      this.Layout = { id: newNodeId(), type: 'split', direction: 'h', first: this.Layout, second: fromLeaf };
    } else {
      const bspDir: 'v' | 'h'          = (dir === 'left' || dir === 'right') ? 'v' : 'h';
      const position: 'first' | 'second' = (dir === 'left'  || dir === 'up')  ? 'first' : 'second';
      this.Layout = addToFocused(this.Layout, toId, fromId, bspDir, position);
    }
    this.FocusedAreaId = fromId;
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
