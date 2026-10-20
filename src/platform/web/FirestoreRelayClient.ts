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
import { firestoreUserDocumentsBaseUrl } from '../../../shared/firebaseAuth';
import { FirebaseAuthService } from './FirebaseAuthService';
import { getFirebaseClient } from './firebaseClient';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';

const STORAGE_KEY_RELAY_DEVICE_ID = 'thinktank.web.relayDeviceId';
const STORAGE_KEY_RELAY_SECRET = 'thinktank.web.relayPairingSecret';
const STORAGE_KEY_FIREBASE_PROJECT = 'thinktank.web.firebaseProjectId';
const STORAGE_KEY_RELAY_ENABLED = 'thinktank.web.pcLinkEnabled';

export interface RelayClientConfig {
  enabled: boolean;
  targetDeviceId: string;
  pairingSecret: string;
  firebaseProjectId: string;
}

class FirestoreRelayClientImpl {
  public getConfig(): RelayClientConfig {
    const envObj =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string> }).env) ||
      {};
    if (typeof localStorage === 'undefined') {
      return {
        enabled: false,
        targetDeviceId: envObj.VITE_RELAY_DEVICE_ID || '',
        pairingSecret: envObj.VITE_RELAY_PAIRING_SECRET || '',
        firebaseProjectId: envObj.VITE_FIREBASE_PROJECT_ID || '',
      };
    }
    return {
      enabled: localStorage.getItem(STORAGE_KEY_RELAY_ENABLED) === 'true',
      targetDeviceId:
        localStorage.getItem(STORAGE_KEY_RELAY_DEVICE_ID) || envObj.VITE_RELAY_DEVICE_ID || '',
      pairingSecret:
        localStorage.getItem(STORAGE_KEY_RELAY_SECRET) || envObj.VITE_RELAY_PAIRING_SECRET || '',
      firebaseProjectId:
        localStorage.getItem(STORAGE_KEY_FIREBASE_PROJECT) ||
        envObj.VITE_FIREBASE_PROJECT_ID ||
        '',
    };
  }

  public saveConfig(partial: Partial<RelayClientConfig>): RelayClientConfig {
    if (typeof localStorage !== 'undefined') {
      if (partial.enabled !== undefined) {
        localStorage.setItem(STORAGE_KEY_RELAY_ENABLED, String(partial.enabled));
      }
      if (partial.targetDeviceId !== undefined) {
        localStorage.setItem(STORAGE_KEY_RELAY_DEVICE_ID, partial.targetDeviceId.trim());
      }
      if (partial.pairingSecret !== undefined) {
        localStorage.setItem(STORAGE_KEY_RELAY_SECRET, partial.pairingSecret.trim());
      }
      if (partial.firebaseProjectId !== undefined) {
        localStorage.setItem(STORAGE_KEY_FIREBASE_PROJECT, partial.firebaseProjectId.trim());
      }
    }
    return this.getConfig();
  }

  public isConfigured(): boolean {
    const cfg = this.getConfig();
    if (typeof window !== 'undefined' && window.electronAPI?.relay) {
      // Electron のローカルAIは ai IPC で直接判定し、PC連携設定とは分離する。
      return false;
    }
    return Boolean(
      cfg.enabled && cfg.targetDeviceId && cfg.pairingSecret && cfg.firebaseProjectId,
    );
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
    if (!cfg.enabled || !cfg.pairingSecret || !cfg.firebaseProjectId || !cfg.targetDeviceId) {
      throw new Error(
        'PC連携がOFF、またはホストPCが未設定です。設定画面でPC連携を有効にし、ホストPCのDevice IDとPairing Secretを設定してください。',
      );
    }

    const encryptedRequest = await encryptRelayPayload(envelope, cfg.pairingSecret);
    const chunks = splitIntoChunks(encryptedRequest, 'request');

    // ルールは users/{uid} を本人だけに許すので、中継役PCと同じ Google アカウントの uid で読み書きする
    const auth = await FirebaseAuthService.getAuth();

    const sdkUser = await FirebaseAuthService.ensureSdkAuth();
    if (sdkUser.uid !== auth.uid) {
      throw new Error('ThinkデータとPC連携で異なるFirebaseアカウントが選択されています。');
    }
    const { db } = await getFirebaseClient(cfg.firebaseProjectId);

    const baseUrl = firestoreUserDocumentsBaseUrl(cfg.firebaseProjectId, auth.uid);
    const authHeaders = { Authorization: `Bearer ${auth.idToken}` };

    // config/activeRelay は複数の中継役が上書きし合うので、宛先の端末自身のハートビートで生存を確かめる
    const deviceRes = await fetch(
      `${baseUrl}/devices/${encodeURIComponent(cfg.targetDeviceId)}`,
      { headers: authHeaders },
    );
    if (deviceRes.status === 401 || deviceRes.status === 403) {
      throw new Error(`Firestore へのアクセスが拒否されました (HTTP ${deviceRes.status})`);
    }
    const heartbeat = deviceRes.ok
      ? ((await deviceRes.json()) as { fields?: { lastHeartbeatAt?: { stringValue?: string } } })
          .fields?.lastHeartbeatAt?.stringValue
      : undefined;
    if (!heartbeat || !isRelayHeartbeatAlive(heartbeat)) {
      throw new Error(
        heartbeat
          ? `中継役PC（${cfg.targetDeviceId}）は現在オフラインです（ハートビート期限切れ）。`
          : `中継役PC（${cfg.targetDeviceId}）が見つかりません。そのPCのElectron版でFirebaseにログインし、PC連携をONにしてください。`,
      );
    }

    // 大きなペイロードはチャンクを先に書き込んでから queued ドキュメントを作成する
    if (chunks.length > 1) {
      for (const ch of chunks) {
        const chunkRes = await fetch(
          `${baseUrl}/relayRequests/${encodeURIComponent(requestId)}/chunks?documentId=req_${ch.index}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
              fields: {
                index: { integerValue: String(ch.index) },
                total: { integerValue: String(ch.total) },
                direction: { stringValue: 'request' },
                data: { stringValue: ch.data },
              },
            }),
          },
        );
        if (!chunkRes.ok) {
          throw new Error(`中継リクエストのチャンク送信に失敗しました (HTTP ${chunkRes.status})`);
        }
      }
    }

    // リクエストドキュメントの書き込み
    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + timeoutMs).toISOString();
    const createRes = await fetch(
      `${baseUrl}/relayRequests?documentId=${encodeURIComponent(requestId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          fields: {
            requestId: { stringValue: requestId },
            targetDeviceId: { stringValue: cfg.targetDeviceId },
            kind: { stringValue: kind },
            status: { stringValue: 'queued' },
            createdAt: { stringValue: nowIso },
            updatedAt: { stringValue: nowIso },
            expiresAt: { timestampValue: expiresIso },
            encryptedRequest: { stringValue: chunks.length === 1 ? encryptedRequest : '' },
            requestChunkCount: { integerValue: String(chunks.length) },
          },
        }),
      },
    );
    if (!createRes.ok) {
      throw new Error(`Firestore 中継リクエストの送信に失敗しました (HTTP ${createRes.status})`);
    }

    // 応答はFirestore SDKのリアルタイムリスナーで待つ。接続中に定期GETは行わない。
    const requestRef = doc(db, 'users', auth.uid, 'relayRequests', requestId);

    return new Promise<RelayResponsePlaintext<TRes>>((resolve, reject) => {
      let settled = false;
      let unsubscribe = () => {};
      const finish = (
        result: { value: RelayResponsePlaintext<TRes> } | { error: unknown },
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        if ('value' in result) resolve(result.value);
        else reject(result.error);
      };

      const timeout = setTimeout(() => {
        // 成功書き込みとの競合を避け、ここでは状態を上書きしない。未処理の依頼は
        // expiresAtを見たPC側がexpiredへ遷移させる。
        finish({ error: new Error('中継役PCからの応答がタイムアウトしました。') });
      }, timeoutMs);

      unsubscribe = onSnapshot(
        requestRef,
        (snapshot) => {
          if (!snapshot.exists() || settled) return;
          const data = snapshot.data() as {
            status?: string;
            encryptedResponse?: string;
            responseChunkCount?: number;
            errorMessage?: string;
          };
          if (data.status === 'succeeded') {
            void (async () => {
              try {
                let fullCipher = data.encryptedResponse || '';
                const chunkCount = Number(data.responseChunkCount || 1);
                if (chunkCount > 1 && !fullCipher) {
                  const chunkSnapshot = await getDocs(collection(requestRef, 'chunks'));
                  const responseChunks: FirestoreRelayChunkDoc[] = chunkSnapshot.docs
                    .map((item) => item.data() as Partial<FirestoreRelayChunkDoc>)
                    .filter((item) => item.direction === 'response')
                    .map((item) => ({
                      index: Number(item.index || 0),
                      total: Number(item.total || 1),
                      direction: 'response' as const,
                      data: item.data || '',
                    }));
                  fullCipher = reassembleChunks(responseChunks);
                }
                if (!fullCipher) throw new Error('中継役PCから空の応答を受信しました。');
                const value = await decryptRelayPayload<RelayResponsePlaintext<TRes>>(
                  fullCipher,
                  cfg.pairingSecret,
                );
                finish({ value });
              } catch (error) {
                finish({ error });
              }
            })();
            return;
          }
          if (
            data.status === 'failed' ||
            data.status === 'canceled' ||
            data.status === 'expired'
          ) {
            finish({
              error: new Error(
                data.errorMessage || `中継処理が失敗しました (${data.status})`,
              ),
            });
          }
        },
        (error) => finish({ error }),
      );
    });
  }
}

export const FirestoreRelayClient = new FirestoreRelayClientImpl();
