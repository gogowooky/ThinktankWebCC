/**
 * IStorageBackend.ts
 * ストレージバックエンド共通インターフェース
 * LocalStorageBackend（C# API）と BigQueryStorageBackend（Express）の両方が実装する
 */

export interface ThinkMeta {
  id:          string;
  contentType: string;
  title:       string;
  keywords:    string;
  relatedIds:  string;
  sizeBytes:   number;
  isDeleted:   boolean;
  createdAt:   string;
  updatedAt:   string;
  metadata?:   Record<string, any>;
}

export interface SavePayload {
  id:          string;
  contentType: string;
  fullContent: string;  // TTThink.Content（タイトル行 + 本文）
  keywords:    string;
  relatedIds:  string;
  metadata?:   Record<string, any>;
  /**
   * この Think を読み込んだ時点のサーバー側 updatedAt。指定すると、保存前にサーバーが
   * それより新しいレコードを持っていた場合に StorageConflictError で弾く（楽観ロック。
   * PROJECT_REVIEW_REPORT.md D-2）。現状 BigQuery バックエンドのみ対応。
   */
  baseUpdatedAt?: string;
}

/** 楽観ロックの衝突（サーバー側に自分の知らない更新がある）*/
export class StorageConflictError extends Error {
  constructor(
    public readonly thinkId: string,
    public readonly serverUpdatedAt: string,
  ) {
    super(`サーバー側に「${thinkId}」の新しい変更があります`);
    this.name = 'StorageConflictError';
  }
}

export interface IStorageBackend {
  /** メタデータ一覧（content なし）を取得する */
  listMeta(): Promise<ThinkMeta[]>;

  /** 本文のみ取得する（タイトル行以降）*/
  getContent(id: string): Promise<string | null>;

  /** 保存（Upsert）する */
  save(payload: SavePayload): Promise<ThinkMeta>;

  /** 削除する */
  delete(id: string): Promise<void>;

  /** 全文検索する */
  search(query: string): Promise<ThinkMeta[]>;
}
