/**
 * TTWorkoutPanel.ts
 * WorkoutArea 群を BSP ツリーで管理するビューモデル。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTWorkoutArea } from './TTWorkoutArea';
import { TTUIStateManager } from './TTUIStateManager';
import type { MediaType } from '../types';
import { loadAiModelSelection, saveAiModelSelection } from '../services/aiModels';
import type { AiModelSelection, AiProvider } from '../services/aiModels';
import {
  DEFAULT_MARKS, createColorStatusDefaults, getDefaultColorStyle, toggleAttr,
} from '../utils/defaultColor';
import type { ColorProp, ColorStyle } from '../utils/defaultColor';

const AI_MODEL_STORAGE_KEY = 'tt-ai-model-workout';

export type WorkoutViewMode = 'workout' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph' | 'chat';

// ── TextEditorSettings ────────────────────────────────────────────────────

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

  FindOption = { MatchCase: false, MatchWholeWord: false, UseRexp: false };
  ReplaceOption = { PreserveCase: false };

  /**
   * 箇条書き・コメント。行頭記号は Marks（CSV）だけが持ち、色・表示属性は ColorStatus
   * （docs/DefaultColor.md の TextEditor.<種別>.Style(1..N).*）が持つ。
   * CSVの n 番目のアイテムが StyleN に対応する。
   */
  Bullet  = { Marks: DEFAULT_MARKS.Bullet };
  Comment = { Marks: DEFAULT_MARKS.Comment };

  // エディタの基本色（TextEditor.Text / .Selection / .Occurrence / .FoldingHeader）も
  // 下の ColorStatus が持つ。専用フィールド（旧 TextEditor.Color.*）は廃止した。
  // Heading / Highlighter / Url / Filepath / Tag のスタイルも ColorStatus が持つ
  // （docs/DefaultColor.md の TextEditor.Heading.Style(1..6).* / .Highlighter.Style(1..6).*
  //   / .Url.Style.* / .Filepath.Style.* / .Tag.Style.*）。

  /**
   * docs/DefaultColor.md 由来の色設定。キーは StatusID名（例: 'TextEditor.Bold'）で、
   * 値は Color / BgColor / Attrs の3項目。StatusID変数 `<StatusID>.<項目>` の実体であり、
   * 登録と読み書きは TTUIStateManager の PROP_SPECS が担う。
   */
  ColorStatus: Record<string, ColorStyle> = createColorStatusDefaults();
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

  /** WorkoutPanel内にThinkファイルがDropされた際に設定されるファイルID（WorkoutPanel.DroppedFile.ID） */
  public DroppedFileID: string = '';

  // ── チェックボックス選択（Think一覧/chat選択欄で共通。TTApplication が4パネル分をまとめて共有）───

  /** チェックされているThink IDリスト（Thinktank/Overview/Workout/ReThink で共通） */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    this.SharedState.checkedIds = val;
    if (this._parent) {
      const app = this._parent as any;
      for (const key of ['ThinktankPanel', 'OverviewPanel', 'ReThinkPanel']) {
        app[key]?.NotifyUpdated();
      }
    }
    TTUIStateManager.instance.notifyPropertyChanged('Application.CheckedItem.IDs');
  }

  /** 指定した ID (群) のチェック状態を切り替える / 指定する */
  public ToggleCheck(id: string | string[], forceChecked?: boolean): void {
    const ids = Array.isArray(id) ? id : [id];
    const current = new Set(this.CheckedThoughtIDs);
    ids.forEach(targetId => {
      const isChecked = current.has(targetId);
      const nextChecked = (forceChecked !== undefined) ? forceChecked : !isChecked;
      if (nextChecked) current.add(targetId); else current.delete(targetId);
    });
    this.CheckedThoughtIDs = Array.from(current);
    this.NotifyUpdated();
  }

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

  /** Think一覧/AI相談の「コンテンツで絞込み」実行時、キーワードをHighlighterへ追加するか */
  public AddContentSearchKeywordFlag: boolean = true;
  /** Think一覧/AI相談の「タイトルで絞込み」実行時、キーワードをHighlighterへ追加するか */
  public AddTitleSearchKeywordFlag: boolean = true;

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

  /**
   * docs/DefaultColor.md 由来の StatusID変数を1項目だけ書き換える。
   * notify=false は PROP_SPECS.set() 経由の呼び出し用（通知は _applyContent がまとめて行う）。
   */
  public SetColorStatus(statusId: string, prop: ColorProp, value: string, notify = true) {
    const current = this.TextEditor.ColorStatus[statusId] ?? getDefaultColorStyle(statusId);
    this.TextEditor.ColorStatus = {
      ...this.TextEditor.ColorStatus,
      [statusId]: { ...current, [prop]: value },
    };
    if (notify) this.NotifyUpdated();
  }

  /** StatusID の現在の色設定を返す（未登録IDは既定値） */
  public GetColorStatus(statusId: string): ColorStyle {
    return this.TextEditor.ColorStatus[statusId] ?? getDefaultColorStyle(statusId);
  }

  /** StatusID の Attrs に表示属性（bold / underline 等）を足す・外す */
  public ToggleColorStatusAttr(statusId: string, attr: string, on: boolean) {
    this.SetColorStatus(statusId, 'Attrs', toggleAttr(this.GetColorStatus(statusId).Attrs, attr, on));
  }

  // ── AI Chat モデル選択 ────────────────────────────────────────────────
  // WorkoutSettingArea（設定パネルのChatタブ）と、各Pane内のChatMedia
  // （WorkoutPanel.DoOnCursorPos:Chat 等で開くAI Chat Pane）が共通で使う。
  // パネル単位で1つだけ選択を持ち、両者は常に同じモデルを参照する。

  /** AI Chat のホストプロバイダ（ブラウザ再起動後も localStorage から復元） */
  public AIChatProvider: AiProvider = loadAiModelSelection(AI_MODEL_STORAGE_KEY).provider;
  /** AI Chat のホストモデルID */
  public AIChatModel: string = loadAiModelSelection(AI_MODEL_STORAGE_KEY).model;

  public SetAIChatModel(selection: AiModelSelection): void {
    this.AIChatProvider = selection.provider;
    this.AIChatModel = selection.model;
    saveAiModelSelection(AI_MODEL_STORAGE_KEY, selection);
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
