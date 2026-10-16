/**
 * src/platform/web/FirestoreRelayClient.ts
 * Web版から「利用者が指定した1台の中継役PC（Active Relay）」へ
 * E2EE（AES-256-GCM）暗号化メッセージを送信し、応答を受け取るクライアント（システム設計メモ §11〜§13 準拠）。
 */

import {
  splitIntoChunks,
  reassembleChunks,
  isRelayHeartbeatAlive,
  type RelayOperationKind,
  type RelayEnvelopePlaintext,
  type RelayResponsePlaintext,
  type FirestoreRelayChunkDoc,
} from '../../../shared/relayProtocol';
import { encryptRelayPayload, decryptRelayPayload } from '../../../shared/relayCrypto';

const STORAGE_KEY_RELAY_DEVICE_ID = 'thinktank.web.relayDeviceId';
const STORAGE_KEY_RELAY_SECRET = 'thinktank.web.relayPairingSecret';
const STORAGE_KEY_FIREBASE_PROJECT = 'thinktank.web.firebaseProjectId';
const STORAGE_KEY_FIREBASE_UID = 'thinktank.web.firebaseUid';

export interface RelayClientConfig {
  targetDeviceId: string;
  pairingSecret: string;
  firebaseProjectId: string;
  firebaseUid: string;
}

class FirestoreRelayClientImpl {
  public getConfig(): RelayClientConfig {
    const envObj =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string> }).env) ||
      {};
    if (typeof localStorage === 'undefined') {
      return {
        targetDeviceId: envObj.VITE_RELAY_DEVICE_ID || '',
        pairingSecret: envObj.VITE_RELAY_PAIRING_SECRET || '',
        firebaseProjectId: envObj.VITE_FIREBASE_PROJECT_ID || '',
        firebaseUid: envObj.VITE_FIREBASE_UID || 'default_user',
      };
    }
    return {
      targetDeviceId:
        localStorage.getItem(STORAGE_KEY_RELAY_DEVICE_ID) || envObj.VITE_RELAY_DEVICE_ID || '',
      pairingSecret:
        localStorage.getItem(STORAGE_KEY_RELAY_SECRET) || envObj.VITE_RELAY_PAIRING_SECRET || '',
      firebaseProjectId:
        localStorage.getItem(STORAGE_KEY_FIREBASE_PROJECT) ||
        envObj.VITE_FIREBASE_PROJECT_ID ||
        '',
      firebaseUid:
        localStorage.getItem(STORAGE_KEY_FIREBASE_UID) || envObj.VITE_FIREBASE_UID || 'default_user',
    };
  }

  public saveConfig(partial: Partial<RelayClientConfig>): RelayClientConfig {
    if (typeof localStorage !== 'undefined') {
      if (partial.targetDeviceId !== undefined) {
        localStorage.setItem(STORAGE_KEY_RELAY_DEVICE_ID, partial.targetDeviceId.trim());
      }
      if (partial.pairingSecret !== undefined) {
        localStorage.setItem(STORAGE_KEY_RELAY_SECRET, partial.pairingSecret.trim());
      }
      if (partial.firebaseProjectId !== undefined) {
        localStorage.setItem(STORAGE_KEY_FIREBASE_PROJECT, partial.firebaseProjectId.trim());
      }
      if (partial.firebaseUid !== undefined) {
        localStorage.setItem(STORAGE_KEY_FIREBASE_UID, partial.firebaseUid.trim());
      }
    }
    return this.getConfig();
  }

  public isConfigured(): boolean {
    const cfg = this.getConfig();
    if (typeof window !== 'undefined' && window.electronAPI?.relay) {
      return true;
    }
    return Boolean(cfg.targetDeviceId && cfg.pairingSecret && cfg.firebaseProjectId);
  }

  /**
   * 中継役PCへ E2EE 暗号化リクエストを送り、復号した結果を返す。
   */
  public async request<TReq = unknown, TRes = unknown>(
    kind: RelayOperationKind,
    payload: TReq,
    timeoutMs = 90_000,
  ): Promise<RelayResponsePlaintext<TRes>> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const envelope: RelayEnvelopePlaintext<TReq> = {
      requestId,
      kind,
      createdAt: new Date().toISOString(),
      payload,
    };

    // 1. Electron 上で動作している場合（ローカルループバック E2EE 検証または直接実行）
    if (typeof window !== 'undefined' && window.electronAPI?.relay) {
      const status = await window.electronAPI.relay.getStatus();
      const secret = status.pairingSecret;
      const encryptedRequest = await encryptRelayPayload(envelope, secret);
      const chunks = splitIntoChunks(encryptedRequest, 'request');
      const res = await window.electronAPI.relay.handleEncrypted({
        encryptedRequest: chunks.length === 1 ? encryptedRequest : '',
        chunks,
      });
      const cipherOut =
        res.responseChunks && res.responseChunks.length > 0
          ? reassembleChunks(res.responseChunks)
          : res.encryptedResponse;
      return decryptRelayPayload<RelayResponsePlaintext<TRes>>(cipherOut, secret);
    }

    // 2. Web版：Firestore REST API 経由で中継役PCへ依頼
    const cfg = this.getConfig();
    if (!cfg.pairingSecret || !cfg.firebaseProjectId || !cfg.targetDeviceId) {
      throw new Error(
        '中継役PC（Active Relay）が未設定です。設定画面から中継役PCのデバイスIDとペアリングシークレットを設定してください。',
      );
    }

    const encryptedRequest = await encryptRelayPayload(envelope, cfg.pairingSecret);
    const chunks = splitIntoChunks(encryptedRequest, 'request');
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      cfg.firebaseProjectId,
    )}/databases/(default)/documents/users/${encodeURIComponent(cfg.firebaseUid)}`;

    // Active Relay のハートビート確認
    const activeRelayRes = await fetch(`${baseUrl}/config/activeRelay`);
    if (activeRelayRes.ok) {
      const activeDoc = (await activeRelayRes.json()) as {
        fields?: { lastHeartbeatAt?: { stringValue?: string } };
      };
      const hb = activeDoc.fields?.lastHeartbeatAt?.stringValue;
      if (hb && !isRelayHeartbeatAlive(hb)) {
        throw new Error('指定された中継役PCは現在オフラインです（ハートビート期限切れ）。');
      }
    }

    // リクエストドキュメントの書き込み
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + timeoutMs).toISOString();
    const createRes = await fetch(
      `${baseUrl}/relayRequests?documentId=${encodeURIComponent(requestId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            requestId: { stringValue: requestId },
            targetDeviceId: { stringValue: cfg.targetDeviceId },
            kind: { stringValue: kind },
            status: { stringValue: 'queued' },
            createdAt: { stringValue: nowIso },
            updatedAt: { stringValue: nowIso },
            expiresAt: { stringValue: expiresIso },
            encryptedRequest: { stringValue: chunks.length === 1 ? encryptedRequest : '' },
            requestChunkCount: { integerValue: String(chunks.length) },
          },
        }),
      },
    );
    if (!createRes.ok) {
      throw new Error(`Firestore 中継リクエストの送信に失敗しました (HTTP ${createRes.status})`);
    }

    // 応答ポーリング
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 800));
      const pollRes = await fetch(
        `${baseUrl}/relayRequests/${encodeURIComponent(requestId)}`,
      );
      if (!pollRes.ok) continue;
      const doc = (await pollRes.json()) as {
        fields?: Record<string, { stringValue?: string; integerValue?: string }>;
      };
      const status = doc.fields?.status?.stringValue;
      if (status === 'succeeded') {
        const encryptedResponse = doc.fields?.encryptedResponse?.stringValue || '';
        const chunkCount = Number(doc.fields?.responseChunkCount?.integerValue || '1');
        let fullCipher = encryptedResponse;
        if (chunkCount > 1 && !fullCipher) {
          const chunksRes = await fetch(
            `${baseUrl}/relayRequests/${encodeURIComponent(requestId)}/chunks`,
          );
          const chunksJson = (await chunksRes.json()) as {
            documents?: Array<{
              fields?: Record<string, { stringValue?: string; integerValue?: string }>;
            }>;
          };
          const responseChunks: FirestoreRelayChunkDoc[] = (chunksJson.documents || [])
            .filter((d) => d.fields?.direction?.stringValue === 'response')
            .map((d) => ({
              index: Number(d.fields?.index?.integerValue || '0'),
              total: Number(d.fields?.total?.integerValue || '1'),
              direction: 'response' as const,
              data: d.fields?.data?.stringValue || '',
            }));
          fullCipher = reassembleChunks(responseChunks);
        }
        return decryptRelayPayload<RelayResponsePlaintext<TRes>>(fullCipher, cfg.pairingSecret);
      }
      if (status === 'failed' || status === 'canceled') {
        throw new Error(
          doc.fields?.errorMessage?.stringValue || `中継処理が失敗しました (${status})`,
        );
      }
    }

    throw new Error('中継役PCからの応答がタイムアウトしました。');
  }
}

export const FirestoreRelayClient = new FirestoreRelayClientImpl();
