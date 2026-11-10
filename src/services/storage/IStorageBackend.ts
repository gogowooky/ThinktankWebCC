/**
 * IStorageBackend.ts
 * ストレージバックエンド共通インターフェース
 * Think正本はFirestore。ElectronのローカルMarkdownは復旧用バックアップとして扱う。
 */

export interface ThinkMeta {
  thinkid:     string;
  category:    string;
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
  thinkid:     string;
  category:    string;
  fullContent: string;  // TTThink.Content（タイトル行 + 本文）。保存側で title と body に分ける
  keywords:    string;
  relatedIds:  string;
  metadata?:   Record<string, any>;
  /**
   * この Think を読み込んだ時点のサーバー側 updatedAt。指定すると、保存前にサーバーが
   * それより新しいレコードを持っていた場合に StorageConflictError で弾く（楽観ロック。
   * ）。対応するかどうかはバックエンドごとに異なる。
   */
  baseUpdatedAt?: string;
  /**
   * 保存した端末の id。指定すると、保存後の metadata.savedDeviceId をこの値にする
   * （metadata を渡さなかった場合も、既存の metadata に加えて記録する）。
   * 画面からの保存では StorageManager.save が自動で付ける。Markdownバックアップからの復元や
   * 移行のように、元の記録をそのまま残したい保存では付けない。
   */
  savedDeviceId?: string;
}

/** 最後に保存した端末の id を記録する metadata のキー */
export const SAVED_DEVICE_ID_KEY = 'savedDeviceId';

/** metadata に保存した端末の id を加えた新しいオブジェクトを返す（id が空なら元のまま） */
export function withSavedDeviceId<T extends Record<string, unknown>>(
  metadata: T,
  deviceId: string | undefined,
): T {
  const id = deviceId?.trim();
  return id ? { ...metadata, [SAVED_DEVICE_ID_KEY]: id } : metadata;
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

/**
 * 保存の応答待ちを打ち切った。サーバー側では保存が完了している可能性があるため、
 * 「保存されなかった」とは断定できない。
 */
export class StorageTimeoutError extends Error {
  constructor(public readonly thinkId: string) {
    super(`「${thinkId}」の保存が時間内に完了しませんでした`);
    this.name = 'StorageTimeoutError';
  }
}

export interface IStorageBackend {
  /** メタデータ一覧（content なし）を取得する */
  listMeta(): Promise<ThinkMeta[]>;

  /** 前回の一覧を通信なしで返す。古い可能性があるので、必ず listMeta の結果で確かめ直す。 */
  listMetaCached?(): Promise<ThinkMeta[] | null>;

  /** getBody などで正本から読んだ直後の、その版のメタデータ */
  knownMeta?(id: string): ThinkMeta | null;

  /**
   * 本文のみ取得する（タイトル行を含まない）。
   * TTThink.Content は「タイトル行 + 本文」なので、戻り値はそれとは別物。
   */
  getBody(id: string): Promise<string | null>;

  /** 保存（Upsert）する */
  save(payload: SavePayload): Promise<ThinkMeta>;

  /** 削除する */
  delete(id: string): Promise<void>;

  /** 全文検索する */
  search(query: string): Promise<ThinkMeta[]>;
}
