/**
 * IStorageService.ts
 * ストレージ抽象化インターフェース
 *
 * BigQuery / IndexedDB の両方で実装し、StorageManagerで統合する。
 */

export interface FileRecord {
  file_id: string;
  title: string | null;
  file_type: string;
  category: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface VersionInfo {
  file_id: string;
  updated_at: string;
}

export interface IStorageService {
  /** サービス名（デバッグ用） */
  readonly name: string;

  /** 初期化 */
  initialize(): Promise<boolean>;

  /** ファイル一覧取得 */
  listFiles(category?: string): Promise<FileRecord[]>;

  /** 単一ファイル取得 */
  getFile(fileId: string): Promise<FileRecord | null>;

  /** ファイル保存（upsert） */
  saveFile(record: FileRecord): Promise<void>;

  /** ファイル削除 */
  deleteFile(fileId: string): Promise<void>;

  /** 全データ取得 */
  getAllFiles(): Promise<FileRecord[]>;

  /** バージョン情報取得 */
  getVersions(): Promise<VersionInfo[]>;

  /** 一括保存 */
  bulkSave(records: FileRecord[]): Promise<void>;
}
