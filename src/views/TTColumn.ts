import { TTObject } from '../models/TTObject';
import { TTDataCollection } from '../models/TTDataCollection';
import { TTModels } from '../models/TTModels';
import type { ColumnIndex } from '../types';

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
  private _dataGridResource: string = 'Memos';

  /** 選択中アイテムID */
  private _selectedItemID: string = '';

  // ─── WebViewPanel 状態 ───

  /** WebView表示URL/プロトコル */
  private _webViewUrl: string = '';

  // ─── TextEditorPanel 状態 ───

  /** 編集中アイテムID */
  private _editorResource: string = '';

  /** ハイライタバーのキーワード */
  private _highlighterKeyword: string = '';

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
  public FontSize: number = 14;

  public override get ClassName(): string {
    return 'TTColumn';
  }

  constructor(index: ColumnIndex) {
    super();
    this.Index = index;
    this.ID = `Column${index}`;
    this.Name = `Column${index}`;
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
    // 選択変更時にEditorResourceも連動更新
    this._editorResource = value;
    this.NotifyUpdated(false);
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

  /** TextEditorHighlighter キーワード */
  public get HighlighterKeyword(): string {
    return this._highlighterKeyword;
  }
  public set HighlighterKeyword(value: string) {
    if (this._highlighterKeyword === value) return;
    this._highlighterKeyword = value;
    this.NotifyUpdated(false);
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
    // デフォルトはMemosコレクション
    return models.Memos;
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
    if (state.FontSize !== undefined) this.FontSize = parseInt(state.FontSize, 10) || 14;
    this.NotifyUpdated(false);
  }
}
