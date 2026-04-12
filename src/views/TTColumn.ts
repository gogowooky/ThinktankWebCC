import { TTObject } from '../models/TTObject';
import { TTDataCollection } from '../models/TTDataCollection';
import { TTModels } from '../models/TTModels';
import { buildMarkdownUrl, buildChatUrl } from '../utils/webviewUrl';
import type { ColumnIndex, PanelType, HighlightTargets, ChatMessage } from '../types';

/**
 * TTColumn - 列ビューモデル
 *
 * 1列分のUI状態（DataGrid/WebView/TextEditor）を管理する。
 * DataGrid選択 → TextEditorロード、フィルタ変更等のパネル間連携を制御。
 */
export class TTColumn extends TTObject {
  /** 列インデックス (0, 1, 2) */
  public readonly Index: ColumnIndex;

  // ─── DataGridPanel 状態 ───

  /** フィルタ式テキスト */
  private _dataGridFilter: string = '';

  /** ソートプロパティ */
  public DataGridSortProperty: string = 'ID';

  /** ソート方向 */
  public DataGridSortDir: 'asc' | 'desc' = 'desc';

  /** 表示対象のコレクション参照名 */
  private _dataGridResource: string = 'Knowledge';

  /** 選択中アイテムID */
  private _selectedItemID: string = '';

  /** チェック済みアイテムIDセット（複数選択） */
  private _checkedItemIDs: Set<string> = new Set();

  // ─── WebViewPanel 状態 ───

  /** WebView表示URL/プロトコル */
  private _webViewUrl: string = '';

  // ─── TextEditorPanel 状態 ───

  /** 編集中アイテムID */
  private _editorResource: string = '';

  /** ハイライタバーのキーワード */
  private _highlighterKeyword: string = '';

  /** ハイライト適用対象設定 */
  private _highlightTargets: HighlightTargets = {
    panelTitle: false,
    dataGrid: false,
    webView: false,
  };

  /** TextEditorの選択テキスト */
  private _editorSelection: string = '';
  private _selectionDebounce: number = 0;

  // ─── ChatPanel 状態 ───

  /** チャットメッセージ履歴 */
  private _chatMessages: ChatMessage[] = [];

  /** Chatバー入力中テキスト */
  private _chatInput: string = '';

  /** チャットセッションID（列インスタンスごとに固定） */
  private _chatSessionId: string = '';

  // ─── レイアウト状態 ───

  /** 表示/非表示（レスポンシブ制御用） */
  public IsVisible: boolean = true;

  /** パネル高さ比率 [DataGrid, WebView, TextEditor] */
  public VerticalRatios: [number, number, number] = [0.3, 0.35, 0.35];

  /** 列幅（ピクセル、AppLayoutが管理） */
  public Width: number = 0;

  /** 列高さ（ピクセル、AppLayoutが管理） */
  public Height: number = 0;

  /** フォントサイズ */
  public FontSize: number = 13;

  /** フォーカス中のパネル */
  private _focusedPanel: PanelType = 'DataGrid';

  public override get ClassName(): string {
    return 'TTColumn';
  }

  constructor(index: ColumnIndex) {
    super();
    this.Index = index;
    this.ID = `Column${index}`;
    this.Name = `Column${index}`;
    this._chatSessionId = `col${index}-${Date.now()}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // プロパティ（setter で通知発行）
  // ═══════════════════════════════════════════════════════════════

  /** DataGrid フィルタ式 */
  public get DataGridFilter(): string {
    return this._dataGridFilter;
  }
  public set DataGridFilter(value: string) {
    if (this._dataGridFilter === value) return;
    this._dataGridFilter = value;
    this.NotifyUpdated(false);
  }

  /** DataGrid 表示対象コレクション名 */
  public get DataGridResource(): string {
    return this._dataGridResource;
  }
  public set DataGridResource(value: string) {
    if (this._dataGridResource === value) return;
    this._dataGridResource = value;
    this.NotifyUpdated(false);
  }

  /** DataGrid 選択中アイテムID */
  public get SelectedItemID(): string {
    return this._selectedItemID;
  }
  public set SelectedItemID(value: string) {
    if (this._selectedItemID === value) return;
    this._selectedItemID = value;
    // 選択変更時にEditorResource + WebViewUrlも連動更新
    this._editorResource = value;
    if (value) {
      const collection = this.GetCurrentCollection();
      const item = collection?.GetDataItem(value);
      if (item?.ContentType === 'chat') {
        // チャットアイテムはチャットUIで復元表示
        this._webViewUrl = buildChatUrl(value);
      } else {
        // メモ等はMarkdownプレビュー
        this._webViewUrl = buildMarkdownUrl(this._dataGridResource || 'Knowledge', value);
      }
    } else {
      this._webViewUrl = '';
    }
    this.NotifyUpdated(false);
  }

  /** チェック済みアイテムIDセット */
  public get CheckedItemIDs(): Set<string> {
    return this._checkedItemIDs;
  }

  /** チェック状態をトグル */
  public toggleChecked(id: string): void {
    if (this._checkedItemIDs.has(id)) {
      this._checkedItemIDs.delete(id);
    } else {
      this._checkedItemIDs.add(id);
    }
    this.NotifyUpdated(false);
  }

  /** 全選択/全解除 */
  public setAllChecked(ids: string[], checked: boolean): void {
    if (checked) {
      ids.forEach(id => this._checkedItemIDs.add(id));
    } else {
      this._checkedItemIDs.clear();
    }
    this.NotifyUpdated(false);
  }

  /** チェック済みアイテム数 */
  public get CheckedCount(): number {
    return this._checkedItemIDs.size;
  }

  /** WebView URL/プロトコル */
  public get WebViewUrl(): string {
    return this._webViewUrl;
  }
  public set WebViewUrl(value: string) {
    if (this._webViewUrl === value) return;
    this._webViewUrl = value;
    this.NotifyUpdated(false);
  }

  /** TextEditor 編集中アイテムID */
  public get EditorResource(): string {
    return this._editorResource;
  }
  public set EditorResource(value: string) {
    if (this._editorResource === value) return;
    this._editorResource = value;
    this.NotifyUpdated(false);
  }

  /** フォーカス中のパネル */
  public get FocusedPanel(): PanelType {
    return this._focusedPanel;
  }
  public set FocusedPanel(value: PanelType) {
    if (this._focusedPanel === value) return;
    this._focusedPanel = value;
    this.NotifyUpdated(false);
  }

  /** TextEditorHighlighter キーワード */
  public get HighlighterKeyword(): string {
    return this._highlighterKeyword;
  }
  public set HighlighterKeyword(value: string) {
    if (this._highlighterKeyword === value) return;
    this._highlighterKeyword = value;
    this.NotifyUpdated(false);
  }

  /** ハイライト適用対象設定 */
  public get HighlightTargets(): HighlightTargets {
    return this._highlightTargets;
  }

  /** 特定のハイライト対象をトグル */
  public toggleHighlightTarget(key: keyof HighlightTargets): void {
    this._highlightTargets = { ...this._highlightTargets, [key]: !this._highlightTargets[key] };
    this.NotifyUpdated(false);
  }

  /** TextEditorの選択テキスト */
  public get EditorSelection(): string {
    return this._editorSelection;
  }
  public set EditorSelection(value: string) {
    const hadSelection = this._editorSelection.length > 0;
    const hasSelection = value.length > 0;
    this._editorSelection = value;
    // 選択の有無変化 → 即通知、選択範囲変化 → デバウンス通知（行数表示更新）
    if (hadSelection !== hasSelection) {
      this.NotifyUpdated(false);
    } else if (hasSelection) {
      if (this._selectionDebounce) clearTimeout(this._selectionDebounce);
      this._selectionDebounce = window.setTimeout(() => {
        this.NotifyUpdated(false);
      }, 200);
    }
  }

  /** チャットセッションID */
  public get ChatSessionId(): string { return this._chatSessionId; }

  /** チャットバー入力テキスト */
  public get ChatInput(): string { return this._chatInput; }
  public set ChatInput(value: string) {
    if (this._chatInput === value) return;
    this._chatInput = value;
    this.NotifyUpdated(false);
  }

  /** チャットメッセージ一覧 */
  public get ChatMessages(): ChatMessage[] { return this._chatMessages; }

  /** 最後のユーザー発言 */
  public get LastUserMessage(): string {
    for (let i = this._chatMessages.length - 1; i >= 0; i--) {
      if (this._chatMessages[i].role === 'user') return this._chatMessages[i].content;
    }
    return '';
  }

  /** チャットメッセージを追加して通知 */
  public addChatMessage(msg: ChatMessage): void {
    this._chatMessages.push(msg);
    this.NotifyUpdated(false);
  }

  /** 最後のアシスタントメッセージを更新（ストリーミング用） */
  public updateLastAssistantMessage(content: string, isStreaming: boolean): void {
    const last = this._chatMessages[this._chatMessages.length - 1];
    if (last && last.role === 'assistant') {
      last.content = content;
      last.isStreaming = isStreaming;
      this.NotifyUpdated(false);
    }
  }

  /** DataGrid総アイテム数 */
  public GetTotalItemCount(): number {
    return this.GetCurrentCollection()?.GetDataItems().length ?? 0;
  }

  /** DataGridフィルタ適用後の表示アイテム数 */
  public GetDisplayItemCount(): number {
    const collection = this.GetCurrentCollection();
    if (!collection) return 0;
    let result = collection.GetDataItems();
    const filter = this._dataGridFilter.trim();
    if (filter) {
      const orGroups = filter.split(',').map(g => g.trim()).filter(Boolean);
      result = result.filter(item => {
        const text = `${item.ID} ${item.Name} ${item.Keywords}`.toLowerCase();
        return orGroups.some(group => {
          const terms = group.split(/\s+/).filter(Boolean);
          return terms.every(term => {
            if (term.startsWith('-') && term.length > 1) {
              return !text.includes(term.slice(1).toLowerCase());
            }
            return text.includes(term.toLowerCase());
          });
        });
      });
    }
    return result.length;
  }

  /**
   * チャット用コンテキストを構築
   * - チェック済みアイテムのContent
   * - TextEditorの選択テキスト
   */
  public buildChatContext(): { items: { id: string; title: string; contentType: string; content: string }[]; selection: string } {
    const items: { id: string; title: string; contentType: string; content: string }[] = [];
    const collection = this.GetCurrentCollection();
    if (collection) {
      this._checkedItemIDs.forEach(id => {
        const item = collection.GetDataItem(id);
        if (item) {
          items.push({
            id: item.ID,
            title: item.Name,
            contentType: item.ContentType,
            content: item.Content,
          });
        }
      });
    }
    return { items, selection: this._editorSelection };
  }

  // ═══════════════════════════════════════════════════════════════
  // コレクション参照
  // ═══════════════════════════════════════════════════════════════

  /**
   * 現在のDataGridResourceに対応するコレクションを取得
   */
  public GetCurrentCollection(): TTDataCollection | null {
    const models = TTModels.Instance;
    const item = models.GetItem(this._dataGridResource);
    if (item instanceof TTDataCollection) {
      return item;
    }
    // デフォルトはKnowledgeコレクション
    return models.Knowledge;
  }

  // ═══════════════════════════════════════════════════════════════
  // 状態のシリアライズ/復元（Phase 29で完全実装）
  // ═══════════════════════════════════════════════════════════════

  /** 状態をプレーンオブジェクトにシリアライズ */
  public SerializeState(): Record<string, string> {
    return {
      DataGridFilter: this._dataGridFilter,
      DataGridResource: this._dataGridResource,
      DataGridSortProperty: this.DataGridSortProperty,
      DataGridSortDir: this.DataGridSortDir,
      SelectedItemID: this._selectedItemID,
      WebViewUrl: this._webViewUrl,
      EditorResource: this._editorResource,
      HighlighterKeyword: this._highlighterKeyword,
      HighlightTargets: JSON.stringify(this._highlightTargets),
      FontSize: String(this.FontSize),
    };
  }

  /** プレーンオブジェクトから状態を復元 */
  public RestoreState(state: Record<string, string>): void {
    if (state.DataGridFilter !== undefined) this._dataGridFilter = state.DataGridFilter;
    if (state.DataGridResource !== undefined) this._dataGridResource = state.DataGridResource;
    if (state.DataGridSortProperty !== undefined) this.DataGridSortProperty = state.DataGridSortProperty;
    if (state.DataGridSortDir !== undefined) this.DataGridSortDir = state.DataGridSortDir as 'asc' | 'desc';
    if (state.SelectedItemID !== undefined) this._selectedItemID = state.SelectedItemID;
    if (state.WebViewUrl !== undefined) this._webViewUrl = state.WebViewUrl;
    if (state.EditorResource !== undefined) this._editorResource = state.EditorResource;
    if (state.HighlighterKeyword !== undefined) this._highlighterKeyword = state.HighlighterKeyword;
    if (state.HighlightTargets !== undefined) {
      try { this._highlightTargets = { ...this._highlightTargets, ...JSON.parse(state.HighlightTargets) }; } catch { /* ignore */ }
    }
    if (state.FontSize !== undefined) this.FontSize = parseInt(state.FontSize, 10) || 14;
    this.NotifyUpdated(false);
  }
}
