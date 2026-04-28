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
}

export interface SavePayload {
  id:          string;
  contentType: string;
  fullContent: string;  // TTThink.Content（タイトル行 + 本文）
  keywords:    string;
  relatedIds:  string;
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
