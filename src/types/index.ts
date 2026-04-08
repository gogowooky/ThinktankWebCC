/**
 * types/index.ts
 * 共通型定義
 */

// ════════════════════════════════════════════════════════════════════════
// Column 関連
// ════════════════════════════════════════════════════════════════════════

/** 列インデックス */
export type ColumnIndex = 0 | 1 | 2;

/** 列パネル種別 */
export type PanelType = 'DataGrid' | 'WebView' | 'TextEditor';

/** パネルツール（フォーカス対象） */
export type PanelTool = 'Main' | 'Filter' | 'AddrBar' | 'Highlighter';

// ════════════════════════════════════════════════════════════════════════
// Action 関連
// ════════════════════════════════════════════════════════════════════════

/** アクション実行時のコンテキスト */
export interface ActionContext {
  /** 修飾キー (例: ['Control', 'Shift']) */
  Mods?: string[];
  /** イベントキー */
  Key?: string;
  /** 呼び出し元 */
  Sender?: unknown;
  /** ソース列インデックス */
  SourceColumn?: ColumnIndex;
  /** ターゲット列インデックス */
  TargetColumn?: ColumnIndex;
  /** 画面座標 */
  ScreenX?: number;
  ScreenY?: number;
  ClientX?: number;
  ClientY?: number;
  /** リンク情報 */
  RequestID?: string;
  RequestTag?: string;
  /** ドロップ情報 */
  DroppedData?: unknown;
  /** 拡張用 */
  [key: string]: unknown;
}

/** アクションスクリプト関数型 */
export type ActionScript = (context: ActionContext) => void | boolean | Promise<void | boolean>;

// ════════════════════════════════════════════════════════════════════════
// Table 関連
// ════════════════════════════════════════════════════════════════════════

/** ソート方向 */
export type SortDirection = 'asc' | 'desc';

// ════════════════════════════════════════════════════════════════════════
// Highlight 関連
// ════════════════════════════════════════════════════════════════════════

/** キーワードハイライトの適用対象設定 */
export interface HighlightTargets {
  /** パネルタイトル行 */
  panelTitle: boolean;
  /** DataGrid 本体（行データ） */
  dataGrid: boolean;
  /** WebView 本体（iframe 内テキスト） */
  webView: boolean;
}

// ════════════════════════════════════════════════════════════════════════
// Status 関連
// ════════════════════════════════════════════════════════════════════════

/** 状態設定コンフィグ */
export interface StateConfig {
  Default?: (id: string) => string;
  Test?: (id: string, value: string) => boolean;
  Apply?: (id: string, value: string) => void;
  Watch?: (id: string) => void;
}

// ════════════════════════════════════════════════════════════════════════
// Content 関連
// ════════════════════════════════════════════════════════════════════════

/** コンテンツタイプ */
export type ContentType = 'memo' | 'chat' | 'url' | 'file' | 'photo' | 'email' | 'drive';

// ════════════════════════════════════════════════════════════════════════
// Utility 型
// ════════════════════════════════════════════════════════════════════════

/** CSV値型 */
export type CsvValue = string | number | boolean | undefined | null;

/** Observer コールバック型 */
export type UpdateCallback = () => void;
