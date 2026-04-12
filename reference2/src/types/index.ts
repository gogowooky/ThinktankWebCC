/**
 * types/index.ts
 * 共通型定義
 */

// ════════════════════════════════════════════════════════════════════════
// #region Panel 関連
// ════════════════════════════════════════════════════════════════════════

/**
 * パネルの表示モード
 */
export type PanelMode = 'Editor' | 'Table' | 'WebView';

/**
 * パネルのツール（フォーカス対象）
 */
export type PanelTool = 'Main' | 'Keyword';

/**
 * パネル名
 */
export type PanelName = 'Library' | 'Index' | 'Shelf' | 'Desk' | 'System' | 'Chat' | 'Log';

/**
 * すべてのパネル名の配列
 */
export const PanelNames: readonly PanelName[] = ['Library', 'Index', 'Shelf', 'Desk', 'System', 'Chat', 'Log'] as const;

/**
 * すべてのモードの配列
 */
export const PanelModes: readonly PanelMode[] = ['Editor', 'Table', 'WebView'] as const;

/**
 * すべてのツールの配列
 */
export const PanelTools: readonly PanelTool[] = ['Main', 'Keyword'] as const;

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region Action 関連
// ════════════════════════════════════════════════════════════════════════

/**
 * アクション実行時のコンテキスト情報
 */
export interface ActionContext {
    // イベント共通情報
    /** 押されている修飾キーの配列 (例: ['Control', 'Shift']) */
    Mods?: string[];
    /** イベントキー (キーボード: 'A', 'ENTER'等 / マウス: 'LEFT1', 'RIGHT1', 'LINK', 'DROP'等) */
    Key?: string;
    /** 呼び出し元 */
    Sender?: unknown;

    // パネル参照情報（ExPanel-ActivePanel間アクション用）
    /** ソースパネル名（情報を読み取る側。ExMode時=ExCurrentPanel, 通常時=ActivePanel）*/
    SourcePanel?: string;
    /** ターゲットパネル名（操作を実行する側。常にActivePanel）*/
    TargetPanel?: string;

    // マウス座標情報（オプショナル）
    /** 画面X座標 */
    ScreenX?: number;
    /** 画面Y座標 */
    ScreenY?: number;
    /** ビューポート内X座標 */
    ClientX?: number;
    /** ビューポート内Y座標 */
    ClientY?: number;

    // リンククリック情報（オプショナル）
    /** マッチしたTTRequest ID */
    RequestID?: string;
    /** マッチしたテキスト (RequestTag) */
    RequestTag?: string;

    // ドロップ情報（オプショナル）
    /** ドロップされたデータ */
    DroppedData?: unknown;

    // その他の拡張用（後方互換性）
    [key: string]: unknown;
}

/**
 * マウスイベントキーの型定義
 */
export type MouseEventKey =
    | 'LEFT1' | 'LEFT2' | 'LEFT3'   // 左クリック（シングル/ダブル/トリプル）
    | 'RIGHT1'                       // 右クリック
    | 'MIDDLE1'                      // 中クリック
    | 'LINK'                         // リンククリック（TTRequest Determinantマッチ時）
    | 'DROP'                         // ドロップイベント
    | 'TAP1' | 'TAP2'               // タッチ（シングルタップ/ダブルタップ）
    | 'LONGPRESS'                    // 長押し
    | 'SWIPE_LEFT' | 'SWIPE_RIGHT'  // 水平スワイプ
    | 'SWIPE_UP' | 'SWIPE_DOWN';    // 垂直スワイプ

/**
 * アクションのスクリプト関数型
 */
export type ActionScript = (context: ActionContext) => void | boolean | Promise<void | boolean>;

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region Table 関連
// ════════════════════════════════════════════════════════════════════════

/**
 * ソート方向
 */
export type SortDirection = 'asc' | 'desc';

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region Status 関連
// ════════════════════════════════════════════════════════════════════════

/**
 * 状態設定のコンフィグ
 */
export interface StateConfig {
    /** デフォルト値を返す関数 */
    Default?: (id: string) => string;
    /** 値の妥当性をチェックする関数 */
    Test?: (id: string, value: string) => boolean;
    /** 値をビューに適用する関数 */
    Apply?: (id: string, value: string) => void;
    /** ビューの変更を監視する関数 */
    Watch?: (id: string) => void;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region Utility 型
// ════════════════════════════════════════════════════════════════════════

/**
 * CSV の値（文字列または undefined）
 */
export type CsvValue = string | undefined | null;

/**
 * Record 型のキーを持つオブジェクトから、指定したプロパティの値を取得
 */
export type PropertyValue<T, K extends keyof T> = T[K];

// #endregion
