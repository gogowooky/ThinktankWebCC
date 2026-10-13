/**
 * TTDiscussPanel.ts
 * DiscussArea 群を BSP ツリーで管理するビューモデル。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTDiscussArea } from './TTDiscussArea';
import type { MediaType } from '../types';
import { selectionFor, type AiChatProviderName } from '../services/aiChatModelStatus';
import { setPanelCheckedIds, togglePanelChecks, setPanelAreaOpen, setPanelAiModel, subscribePanelAiModel } from './panelBehavior';
import type { AiModelSelection, AiProvider } from '../services/aiModels';
import {
  DEFAULT_MARKS, createColorStatusDefaults, getDefaultColorStyle, toggleAttr,
} from '../utils/defaultColor';
import type { ColorProp, ColorStyle } from '../utils/defaultColor';
import { INIT_AREA_WIDTH, type AreaWidthMode } from '../utils/panelAreaWidth';


export type DiscussViewMode = 'panes' | 'texteditor' | 'markdown' | 'datagrid' | 'card' | 'graph' | 'html' | 'chat';

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

  // エディタの基本色（TextEditor.Text / .Selection.Theme / .Occurrence.Theme / .FoldingHeader.Theme）も
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
export type PaneDirection = 'left' | 'right' | 'up' | 'down';
export type PanePlacement = 'add' | 'split';

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

// ── TTDiscussPanel ────────────────────────────────────────────────────

export class TTDiscussPanel extends TTUIItem {
  public Areas: TTDiscussArea[] = [];
  public Layout: LayoutNode | null = null;
  public FocusedAreaId: string | null = null;

  /** DiscussPanel内にThinkファイルがDropされた際に設定されるファイルID（DiscussPanel.DroppedFile.ID） */
  public DroppedFileID: string = '';

  // ── チェックボックス選択（Think一覧/chat選択欄で共通。TTApplication が4パネル分をまとめて共有）───

  /** チェックされているThink IDリスト（Thinktank/Seeds/Discuss/Harvest で共通） */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    setPanelCheckedIds(this, 'DiscussPanel', val);
  }

  /** 指定した ID (群) のチェック状態を切り替える / 指定する */
  public ToggleCheck(id: string | string[], forceChecked?: boolean): void {
    togglePanelChecks(this, id, forceChecked);
  }

  public override get ClassName(): string { return 'TTDiscussPanel'; }

  constructor() {
    super();
    this.ID   = 'DiscussPanel';
    this.Name = 'DiscussPanel';
  }

  // ── 表示モード ────────────────────────────────────────────────────────
  /** 設定パネルの表示モード */
  public ViewMode: DiscussViewMode = 'panes';

  /** ToolBar の表示モード */
  public ToolBarMode: string = 'Copyright';

  /** ToolBar StatusMode用テキスト (CSV形式) */
  public StatusModeText: string = 'ThinktankPanel.Mode.Name,SeedsPanel.Mode.Name,DiscussSettingPanel.Mode.Name';

  public SetViewMode(mode: DiscussViewMode): void {
    this.ViewMode = mode;
    this.NotifyUpdated();
  }

  // ── エリア表示 ────────────────────────────────────────────────────────
  public IsAreaOpen: boolean = true;
  /** Area 表示幅のモード（init=起動時の値 / user=ユーザー設定値 / foredit=編集用の幅）。
   *  Status `DiscussSettingPanel.Area.OpenWidth` の実体。px は panelAreaWidth.ts が導出する。 */
  public AreaWidthMode: AreaWidthMode = 'init';

  /** ユーザーが Splitter で設定した幅(px)。AreaWidthMode='user' のときに使う。 */
  public AreaUserWidth: number = INIT_AREA_WIDTH.Discuss;


  public ToggleArea(): void { setPanelAreaOpen(this, !this.IsAreaOpen); }
  public OpenArea():   void { setPanelAreaOpen(this, true); }
  public CloseArea():  void { setPanelAreaOpen(this, false); }

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
  // プロバイダは Pane の Chat（Status DiscussPanel.AIChat.ModelName）と設定パネルの会話履歴
  // （Status DiscussSettingPanel.AIChat.ModelName）で別々に持つ。モデルはプロバイダ単位で
  // 全パネル共通（Status AIChat.ModelNames.*。services/aiChatModelStatus.ts）。

  /** Status DiscussPanel.AIChat.ModelName の実体（Pane 内の ChatMedia が使う） */
  public AIChatProviderName: AiChatProviderName = 'Claude';
  /** Status DiscussSettingPanel.AIChat.ModelName の実体（DiscussSettingArea の会話履歴が使う） */
  public SettingAIChatProviderName: AiChatProviderName = 'Claude';

  public get AIChatProvider(): AiProvider { return selectionFor(this.AIChatProviderName).provider; }
  public get AIChatModel(): string { return selectionFor(this.AIChatProviderName).model; }
  public get SettingAIChatProvider(): AiProvider { return selectionFor(this.SettingAIChatProviderName).provider; }
  public get SettingAIChatModel(): string { return selectionFor(this.SettingAIChatProviderName).model; }

  public SetAIChatModel(selection: AiModelSelection): void {
    setPanelAiModel(this, selection);
  }

  public SetSettingAIChatModel(selection: AiModelSelection): void {
    setPanelAiModel(this, selection, 'SettingAIChatProviderName');
  }

  // 他パネルで同じプロバイダのモデルが選び直されたら、このパネルの表示も更新する
  private readonly _offModelNames = subscribePanelAiModel(this);

  public dispose(): void {
    this._offModelNames();
    this._parent = null;
  }

  // ── Area CRUD ──────────────────────────────────────────────────────────

  public AddFirst(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea {
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

  public InsertArea(resourceId: string, mediaType: MediaType, title: string, dir: PaneDirection, placement: 'add'): TTDiscussArea;
  public InsertArea(resourceId: string, mediaType: MediaType, title: string, dir: PaneDirection, placement: PanePlacement): TTDiscussArea | null;
  public InsertArea(resourceId: string, mediaType: MediaType, title: string, dir: PaneDirection, placement: PanePlacement): TTDiscussArea | null {
    const focusId = placement === 'split'
      ? this.FocusedAreaId ?? (this.Layout ? collectAreaIds(this.Layout)[0] : null)
      : null;
    if (placement === 'split' && (!focusId || !this.Layout)) return null;

    const direction = dir === 'left' || dir === 'right' ? 'v' : 'h';
    const position = dir === 'left' || dir === 'up' ? 'first' : 'second';
    const area = this._createArea(resourceId, mediaType, title);
    if (placement === 'split') {
      this.Layout = addToFocused(this.Layout!, focusId!, area.ID, direction, position);
    } else {
      const newLeaf: LeafNode = { id: newNodeId(), type: 'leaf', areaId: area.ID };
      this.Layout = this.Layout === null ? newLeaf : {
        id: newNodeId(), type: 'split', direction,
        first: position === 'first' ? newLeaf : this.Layout,
        second: position === 'second' ? newLeaf : this.Layout,
      };
    }
    this.FocusedAreaId = area.ID;
    this.NotifyUpdated();
    return area;
  }

  public AddRight(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea | null {
    return this.InsertArea(resourceId, mediaType, title, 'right', 'split');
  }

  public AddBelow(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea | null {
    return this.InsertArea(resourceId, mediaType, title, 'down', 'split');
  }

  public AddLeft(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea | null {
    return this.InsertArea(resourceId, mediaType, title, 'left', 'split');
  }

  public AddAbove(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea | null {
    return this.InsertArea(resourceId, mediaType, title, 'up', 'split');
  }

  public AddToLeft(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea {
    return this.InsertArea(resourceId, mediaType, title, 'left', 'add');
  }

  public AddToRight(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea {
    return this.InsertArea(resourceId, mediaType, title, 'right', 'add');
  }

  public AddToTop(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea {
    return this.InsertArea(resourceId, mediaType, title, 'up', 'add');
  }

  public AddToBottom(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea {
    return this.InsertArea(resourceId, mediaType, title, 'down', 'add');
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

  public GetArea(areaId: string): TTDiscussArea | undefined {
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

  public ReplaceFocused(resourceId: string, mediaType: MediaType, title: string = ''): TTDiscussArea | null {
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

  /** rawYaml は TextEditor のときだけ有効（YAML＋本文表示。TTDiscussArea.RawYaml） */
  public SetMediaType(areaId: string, mediaType: MediaType, rawYaml: boolean = false): void {
    const area = this.GetArea(areaId);
    if (!area) return;
    area.MediaType = mediaType;
    area.RawYaml   = rawYaml && mediaType === 'texteditor';
    this.NotifyUpdated();
  }

  public ClearAll(): void {
    this.Areas         = [];
    this.Layout        = null;
    this.FocusedAreaId = null;
    this.NotifyUpdated();
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────
  private _createArea(resourceId: string, mediaType: MediaType, title: string): TTDiscussArea {
    const area   = new TTDiscussArea();
    area._parent = this;
    area.OpenThink(resourceId, mediaType, title);
    // 配列の更新もイミュータブルに行う
    this.Areas = [...this.Areas, area];
    return area;
  }
}
