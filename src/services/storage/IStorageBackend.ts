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

export interface HistoryMeta {
  historyId:   string;
  thinkId:     string;
  timestamp:   string;
  title:       string;
  contentType: string;
  summary?:    string;
}

export interface SaveHistoryPayload {
  thinkId:     string;
  timestamp:   string;
  fullContent: string;
  summary?:    string;
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

  /** 指定したThinkの履歴メタデータ一覧を取得する */
  listHistoryMeta(thinkId: string): Promise<HistoryMeta[]>;

  /** 履歴の本文を取得する */
  getHistoryContent(historyId: string): Promise<string | null>;

  /** 履歴（スナップショット）を保存する */
  saveHistory(payload: SaveHistoryPayload): Promise<HistoryMeta>;
}

