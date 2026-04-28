/**
 * types/index.ts
 * v5 共通型定義
 */

// ════════════════════════════════════════════════════════════════════════
// #region アプリモード
// ════════════════════════════════════════════════════════════════════════

export type AppMode = 'pwa' | 'local';

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region コンテンツ種別（v5）
// ════════════════════════════════════════════════════════════════════════

/**
 * TTThink のコンテンツ種別（v5）
 * v4: memo/chat/pickup/link/table
 * v5: memo/thought/tables/links/chat/nettext
 */
export type ContentType =
  | 'memo'     // テキストメモ（markdown含む）
  | 'thought'  // Thinkの集合（ThinkIDリスト or Filter文字列を本文に持つ）
  | 'tables'   // 複数テーブルを含むデータ（独自形式md）
  | 'links'    // URL/ローカルURI等へのリンク集
  | 'chat'     // AIとの対話記録
  | 'nettext'; // ネット等からダウンロードしたテキスト

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region メディア種別（WorkoutArea表示形式）
// ════════════════════════════════════════════════════════════════════════

export type MediaType =
  | 'texteditor'  // Monaco Editor
  | 'markdown'    // Markdownレンダリング
  | 'datagrid'    // テーブル形式一覧
  | 'card'        // カード形式
  | 'graph'       // ノードグラフ
  | 'chat';       // AIチャット

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region ストレージ / データモデル
// ════════════════════════════════════════════════════════════════════════

export interface ItemMeta {
  file_id: string;
  title: string;
  updated_at: string;
  created_at: string;
  file_type: string;
  category: string;
  vault_id: string;
  is_meta_only: boolean;
  is_deleted: boolean;
}

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

export type SyncState = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  lastSyncAt: string | null;
  errorMessage?: string;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region チャット
// ════════════════════════════════════════════════════════════════════════

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// #endregion

// ════════════════════════════════════════════════════════════════════════
// #region ユーティリティ型
// ════════════════════════════════════════════════════════════════════════

export type CsvValue = string | undefined | null;

// #endregion
