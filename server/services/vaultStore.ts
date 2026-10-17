/**
 * vaultStore.ts
 * 思考支援・会話・エージェント系ルートが使う Vault レコード保存先の型。
 * BigQuery の廃止で Express 側には保存先が無くなったため、既定値は常に失敗を返す。
 */

export interface VaultRecord {
  thinkid:     string;
  file_type:   string;        // 固定値 "md"
  category:    string;        // ContentType (memo/bundle/tables/links/chat/nettext)
  title:       string | null;  // 全テキストの1行目。クライアントの TTThink.Content はこれと content を連結したもの
  content:     string | null;  // 本文のみ（タイトル行を含まない）
  keywords:    string | null;
  related_ids: string | null;
  size_bytes:  number | null;
  is_deleted:  boolean | null;
  created_at:  string | object;
  updated_at:  string | object;
  metadata?:   string | null;  // YAML 形式でシリアライズして保持する
}

export type StoreResult<T> = { success: true; data: T } | { success: false; error: string };

export interface VaultStore {
  getRecord(thinkId: string): Promise<StoreResult<VaultRecord | null>>;
  saveThinkSupport(thinkId: string, expectedVersion: string, metadata: object, updatedAt: string): Promise<StoreResult<boolean>>;
  saveChatConversation(thinkId: string, expectedVersion: string, metadata: object, content: string, updatedAt: string): Promise<StoreResult<boolean>>;
  applyAgentArtifact(bundleId: string, expectedVersion: string, metadata: object, updatedAt: string,
    artifact: { thinkId: string; title: string; body: string; metadata: object }): Promise<StoreResult<boolean>>;
}

const UNAVAILABLE = { success: false, error: 'サーバー側の保存先はありません（BigQuery は廃止済み）' } as const;

export const unavailableVaultStore: VaultStore = {
  getRecord: async () => UNAVAILABLE,
  saveThinkSupport: async () => UNAVAILABLE,
  saveChatConversation: async () => UNAVAILABLE,
  applyAgentArtifact: async () => UNAVAILABLE,
};
