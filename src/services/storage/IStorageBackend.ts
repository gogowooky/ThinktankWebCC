/**
 * IStorageBackend.ts
 * ストレージバックエンド共通インターフェース
 * LocalStorageBackend（C# API）と BigQueryStorageBackend（Express）の両方が実装する
 */

export interface ThinkMeta {
  id:          string;
  vaultId:     string;
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
  vaultId:     string;
  contentType: string;
  fullContent: string;  // TTThink.Content（タイトル行 + 本文）
  keywords:    string;
  relatedIds:  string;
}

export interface IStorageBackend {
  /** メタデータ一覧（content なし）を取得する */
  listMeta(vaultId: string): Promise<ThinkMeta[]>;

  /** 本文のみ取得する（タイトル行以降）*/
  getContent(vaultId: string, id: string): Promise<string | null>;

  /** 保存（Upsert）する */
  save(payload: SavePayload): Promise<ThinkMeta>;

  /** 削除する */
  delete(vaultId: string, id: string): Promise<void>;

  /** 全文検索する */
  search(vaultId: string, query: string): Promise<ThinkMeta[]>;
}
