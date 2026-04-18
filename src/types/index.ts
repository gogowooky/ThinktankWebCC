/**
 * types/index.ts
 * v4 共通型定義
 *
 * Phase 2: 基本型（ItemMeta, FileRecord, SyncStatus, AppMode）
 * Phase 13以降: IStorageBackend 関連型を追加予定
 */

// ════════════════════════════════════════════════════════════════════════
// #region アプリモード
// ════════════════════════════════════════════════════════════════════════

/** アプリの動作モード（window.__THINKTANK_MODE__ で切り替え） */
export type AppMode = 'pwa' | 'local';

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region ストレージ / データモデル
// ════════════════════════════════════════════════════════════════════════

/**
 * メタデータのみのレコード（起動時の差分同期で使用）
 * content を含まない軽量表現
 */
export interface ItemMeta {
  file_id: string;
  title: string;
  updated_at: string;    // ISO8601
  created_at: string;    // ISO8601
  file_type: string;     // 'memo' | 'chat' | 'file' | ...
  category: string;      // BigQuery クラスタリングキー
  is_meta_only: boolean; // true = content 未取得
  is_deleted: boolean;
  device_id: string;
  sync_version: number;
}

/**
 * 完全なファイルレコード（本文込み）
 * BigQuery スキーマ / C# Local API レスポンスに対応
 */
export interface FileRecord extends ItemMeta {
  content: string;
  keywords: string;
  related_ids: string;
  size_bytes: number;
  metadata?: Record<string, unknown>;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region 同期ステータス
// ════════════════════════════════════════════════════════════════════════

/** 同期状態の種類 */
export type SyncState = 'synced' | 'syncing' | 'pending' | 'offline' | 'error' | 'conflict';

/**
 * 同期状態（SyncIndicator / タイトルバーに表示）
 */
export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncAt: string | null; // ISO8601 or null
  errorMessage?: string;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region コンテンツ種別
// ════════════════════════════════════════════════════════════════════════

/** TTDataItem のコンテンツ種別 */
export type ContentType =
  | 'memo'   // テキストメモ
  | 'chat'   // AIチャット会話
  | 'file'   // 添付ファイル
  | 'photo'  // 写真
  | 'email'  // メール
  | 'drive'  // Google Drive リンク
  | 'url';   // URL

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region アクション関連
// ════════════════════════════════════════════════════════════════════════

/**
 * アクション実行時のコンテキスト情報
 * Phase 30 以降で拡張予定
 */
export interface ActionContext {
  Mods?: string[];      // 修飾キー（例: ['Control', 'Shift']）
  Key?: string;         // キー（例: 'S', 'ENTER'）
  Sender?: unknown;     // 呼び出し元
  [key: string]: unknown;
}

/** アクションのスクリプト関数型 */
export type ActionScript =
  (context: ActionContext) => void | boolean | Promise<void | boolean>;

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region 状態管理関連
// ════════════════════════════════════════════════════════════════════════

/**
 * TTState の設定オブジェクト
 * Phase 30 以降で Apply / Watch / Calculate を活用予定
 */
export interface TTStateConfig {
  Default?: (id: string) => string;
  Test?: (id: string, value: string) => boolean;
  Apply?: (id: string, value: string) => void;
  Watch?: (id: string) => void;
  Calculate?: (id: string) => string;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region ユーティリティ型
// ════════════════════════════════════════════════════════════════════════

/** CSV の値型 */
export type CsvValue = string | undefined | null;

// #endregion
