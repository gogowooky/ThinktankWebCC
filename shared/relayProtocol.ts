/**
 * shared/relayProtocol.ts
 * Web版 ⇔ 中継役PC（Firestore 経由）の要求・応答プロトコル定義とチャンク分割ロジック。
 * システム設計メモ §11〜§13 準拠。
 */

export type RelayOperationKind =
  | 'search'
  | 'listDiff'
  | 'getBody'
  | 'saveRecord'
  | 'deleteRecord'
  | 'ai.conversation'
  | 'ai.agent'
  | 'ping';

export type RelayRequestStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'expired';

export interface ActiveRelayConfig {
  deviceId: string;
  deviceName: string;
  assignedAt: string;
  lastHeartbeatAt: string;
  capabilities: {
    vaultSearch: boolean;
    aiCli: boolean;
    availableClis: string[];
  };
  publicKeyFingerprint?: string;
}

export interface RelaySearchPayload {
  query: string;
  limit?: number;
}

export interface RelayListDiffPayload {
  sinceUpdatedAt?: string;
  knownVersions?: Record<string, string>;
}

export interface RelayGetBodyPayload {
  thinkid: string;
  includeSupport?: boolean;
}

export interface RelayAiConversationPayload {
  bundleId: string;
  userMessage: string;
  panelRole?: 'seeds' | 'working' | 'discuss' | 'harvest';
  agentId?: string;
  profileId?: string;
  preferredCli?: 'claude' | 'codex' | 'antigravity';
}

export interface RelayEnvelopePlaintext<T = unknown> {
  requestId: string;
  kind: RelayOperationKind;
  createdAt: string;
  payload: T;
}

export interface RelayResponsePlaintext<T = unknown> {
  requestId: string;
  kind: RelayOperationKind;
  completedAt: string;
  ok: boolean;
  error?: string;
  result?: T;
}

export interface FirestoreRelayRequestDoc {
  requestId: string;
  targetDeviceId: string;
  kind: RelayOperationKind;
  status: RelayRequestStatus;
  /** queued を原子的に取得した中継役。再接続時の二重実行を防ぐ。 */
  claimedBy?: string;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  /** E2EE 暗号化済み要求ペイロード（またはチャンク数 > 1 の場合は空） */
  encryptedRequest: string;
  requestChunkCount: number;
  /** E2EE 暗号化済み応答ペイロード（またはチャンク数 > 1 の場合は空） */
  encryptedResponse?: string;
  responseChunkCount?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface FirestoreRelayChunkDoc {
  index: number;
  total: number;
  direction: 'request' | 'response';
  data: string;
}

/** Firestore 1ドキュメント 1MiB 制限に対し、安全マージンを取って 600KB ごとに分割 */
export const DEFAULT_CHUNK_MAX_CHARS = 600_000;

/**
 * 大きな暗号化文字列を Firestore サブコレクション用チャンク配列に分割する。
 */
export function splitIntoChunks(
  data: string,
  direction: 'request' | 'response',
  maxChars = DEFAULT_CHUNK_MAX_CHARS,
): FirestoreRelayChunkDoc[] {
  if (data.length <= maxChars) {
    return [
      {
        index: 0,
        total: 1,
        direction,
        data,
      },
    ];
  }
  const chunks: FirestoreRelayChunkDoc[] = [];
  const total = Math.ceil(data.length / maxChars);
  for (let i = 0; i < total; i++) {
    chunks.push({
      index: i,
      total,
      direction,
      data: data.slice(i * maxChars, (i + 1) * maxChars),
    });
  }
  return chunks;
}

/**
 * 分割されたチャンクを index 順に結合して元の文字列を復元する。
 */
export function reassembleChunks(chunks: readonly FirestoreRelayChunkDoc[]): string {
  if (chunks.length === 0) return '';
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  const expectedTotal = sorted[0].total;
  if (sorted.length !== expectedTotal) {
    throw new Error(
      `チャンク数が一致しません（期待: ${expectedTotal}, 実際: ${sorted.length}）`,
    );
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].index !== i) {
      throw new Error(`チャンク順序が欠落しています（index=${i}）`);
    }
  }
  return sorted.map((c) => c.data).join('');
}

/**
 * 中継役PCのハートビートが有効期限内（デフォルト 90 秒）か判定する。
 */
export function isRelayHeartbeatAlive(lastHeartbeatAt: string, nowMs = Date.now(), maxAgeMs = 90_000): boolean {
  const ts = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts <= maxAgeMs;
}
