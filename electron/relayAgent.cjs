'use strict';

/**
 * electron/relayAgent.cjs
 * PC版を「中継役PC（Active Relay）」として動作させるエージェント（システム設計メモ §11〜§13 準拠）。
 * - Web版からの検索 (search)、差分取得 (listDiff)、本文取得 (getBody)、AI実行 (ai.conversation / ai.agent) を処理
 * - E2EE（AES-256-GCM）による暗号化・復号およびチャンク分割に完全対応
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const shared = require('./shared-dist/index.js');

class RelayAgent {
  constructor({ userDataDir, vaultEngine, aiCliRunner, firebaseApiKey }) {
    this.userDataDir = userDataDir;
    this.vaultEngine = vaultEngine;
    this.aiCliRunner = aiCliRunner;
    this.firebaseApiKey = firebaseApiKey || process.env.VITE_FIREBASE_API_KEY || '';
    this.configPath = path.join(userDataDir, 'relay-agent-config.json');
    this.config = this._loadConfig();
    this.heartbeatTimer = null;
    /** @type {{ uid: string, email: string, idToken: string, refreshToken: string, expiresAtMs: number } | null} */
    this.authSession = null;
    this._authRefreshing = null;
    this._lastFirestoreProblem = '';
  }

  _loadConfig() {
    const defaultDeviceId =
      this.vaultEngine?.config?.deviceId ||
      `pc_${os.hostname().replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const base = {
      enabled: false,
      deviceId: defaultDeviceId,
      deviceName: os.hostname(),
      pairingSecret: shared.generatePairingSecret(),
      firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
      // uid・メールはログイン（refresh token の検証）で確定する
      firebaseUid: '',
      firebaseEmail: '',
      firebaseRefreshToken: '',
      lastHeartbeatAt: new Date().toISOString(),
      processedCount: 0,
    };
    if (fs.existsSync(this.configPath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        return { ...base, ...loaded };
      } catch {
        return base;
      }
    }
    return base;
  }

  saveConfig(partial) {
    this.config = { ...this.config, ...partial };
    this._persistConfig();
    if (this.config.enabled) {
      this._startHeartbeat();
    } else {
      this._stopHeartbeat();
    }
    return this.getStatus();
  }

  rotatePairingSecret() {
    return this.saveConfig({ pairingSecret: shared.generatePairingSecret() });
  }

  getStatus() {
    const clis = this.aiCliRunner.detectAvailableClis();
    const availableClis = Object.entries(clis)
      .filter(([, v]) => v.available)
      .map(([k]) => k);

    const activeRelayConfig = {
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName,
      assignedAt: this.config.lastHeartbeatAt,
      lastHeartbeatAt: this.config.lastHeartbeatAt,
      capabilities: {
        vaultSearch: true,
        aiCli: availableClis.length > 0,
        availableClis,
      },
    };

    return {
      enabled: this.config.enabled,
      deviceId: this.config.deviceId,
      deviceName: this.config.deviceName,
      pairingSecret: this.config.pairingSecret,
      firebaseProjectId: this.config.firebaseProjectId,
      firebaseUid: this.config.firebaseRefreshToken ? this.config.firebaseUid : '',
      firebaseEmail: this.config.firebaseRefreshToken ? this.config.firebaseEmail || '' : '',
      firebaseSignedIn: Boolean(this.config.firebaseRefreshToken),
      lastHeartbeatAt: this.config.lastHeartbeatAt,
      isAlive: shared.isRelayHeartbeatAlive(this.config.lastHeartbeatAt),
      processedCount: this.config.processedCount,
      activeRelayConfig,
    };
  }

  /**
   * ログインページから受け取った Firebase の refresh token を検証して保存する。
   * Firestore のルールが users/{uid} を本人だけに許すため、Web版と同じ Google アカウントの uid が要る。
   */
  async setFirebaseRefreshToken(refreshToken, email = '') {
    if (!this.firebaseApiKey) {
      throw new Error('VITE_FIREBASE_API_KEY が設定されていません。');
    }
    const session = await shared.refreshFirebaseIdToken(this.firebaseApiKey, refreshToken, email);
    this.authSession = session;
    this._lastFirestoreProblem = '';
    const st = this.saveConfig({
      firebaseUid: session.uid,
      firebaseEmail: email,
      firebaseRefreshToken: session.refreshToken,
    });
    await this._publishHeartbeatToFirestore();
    return st;
  }

  signOutFirebase() {
    this.authSession = null;
    return this.saveConfig({ firebaseUid: '', firebaseEmail: '', firebaseRefreshToken: '' });
  }

  async _getAuth() {
    if (!this.config.firebaseRefreshToken || !this.firebaseApiKey) return null;
    if (this.authSession && !shared.needsFirebaseTokenRefresh(this.authSession)) {
      return this.authSession;
    }
    if (!this._authRefreshing) {
      this._authRefreshing = shared
        .refreshFirebaseIdToken(
          this.firebaseApiKey,
          this.config.firebaseRefreshToken,
          this.config.firebaseEmail || '',
        )
        .then((session) => {
          this.authSession = session;
          if (
            session.uid !== this.config.firebaseUid ||
            session.refreshToken !== this.config.firebaseRefreshToken
          ) {
            this.config.firebaseUid = session.uid;
            this.config.firebaseRefreshToken = session.refreshToken;
            this._persistConfig();
          }
          return session;
        })
        .finally(() => {
          this._authRefreshing = null;
        });
    }
    return this._authRefreshing;
  }

  _persistConfig() {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2) + '\n', 'utf8');
  }

  // 同じ失敗を 1.5 秒ごとに出し続けないよう、状態が変わったときだけ表示する
  _reportFirestoreProblem(message) {
    if (message === this._lastFirestoreProblem) return;
    const hadProblem = Boolean(this._lastFirestoreProblem);
    this._lastFirestoreProblem = message;
    if (message) {
      console.warn(`[RelayAgent] ${message}`);
    } else if (hadProblem) {
      console.log('[RelayAgent] Firestore 中継の待ち受けを再開しました。');
    }
  }

  /** @returns {Promise<{ baseUrl: string, headers: Record<string, string> } | null>} */
  async _getFirestoreContext() {
    if (!this.config.firebaseProjectId || typeof fetch !== 'function') return null;
    let auth;
    try {
      auth = await this._getAuth();
    } catch (err) {
      this._reportFirestoreProblem(
        `Firebase トークンを更新できません（再ログインが必要）: ${err.message || err}`,
      );
      return null;
    }
    if (!auth) {
      this._reportFirestoreProblem(
        'Firebase 未ログインのため Firestore 中継を待ち受けていません。ログインページでログインしてください。',
      );
      return null;
    }
    return {
      baseUrl: shared.firestoreUserDocumentsBaseUrl(this.config.firebaseProjectId, auth.uid),
      headers: { Authorization: `Bearer ${auth.idToken}` },
    };
  }

  async _publishHeartbeatToFirestore() {
    const ctx = await this._getFirestoreContext();
    if (!ctx) return;
    try {
      const nowIso = new Date().toISOString();
      this.config.lastHeartbeatAt = nowIso;
      const res = await fetch(`${ctx.baseUrl}/config/activeRelay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...ctx.headers },
        body: JSON.stringify({
          fields: {
            deviceId: { stringValue: this.config.deviceId },
            deviceName: { stringValue: this.config.deviceName },
            lastHeartbeatAt: { stringValue: nowIso },
          },
        }),
      });
      if (!res.ok) {
        this._reportFirestoreProblem(`ハートビートの書き込みに失敗しました (HTTP ${res.status})`);
      }
    } catch {
      // ignore network error during heartbeat
    }
  }

  async _pollFirestoreRequests() {
    if (this._pollingBusy) return;
    this._pollingBusy = true;
    try {
      const ctx = await this._getFirestoreContext();
      if (!ctx) return;
      const { baseUrl, headers } = ctx;
      // 一覧を先頭から読むと処理済みの文書が溜まったとき queued を取りこぼすので、queued だけを問い合わせる
      const res = await fetch(`${baseUrl}:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'relayRequests' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'queued' },
              },
            },
            limit: 20,
          },
        }),
      });
      if (!res.ok) {
        this._reportFirestoreProblem(`中継リクエストの取得に失敗しました (HTTP ${res.status})`);
        return;
      }
      this._reportFirestoreProblem('');
      const rows = await res.json();
      const docs = (Array.isArray(rows) ? rows : []).map((r) => r.document).filter(Boolean);
      for (const doc of docs) {
        const fields = doc.fields || {};
        const status = fields.status?.stringValue;
        const targetDeviceId = fields.targetDeviceId?.stringValue;
        const requestId = fields.requestId?.stringValue;
        if (
          status !== 'queued' ||
          !requestId ||
          (targetDeviceId && targetDeviceId !== this.config.deviceId)
        ) {
          continue;
        }
        const encryptedRequest = fields.encryptedRequest?.stringValue || '';
        const reqChunkCount = Number(fields.requestChunkCount?.integerValue || '1');
        try {
          let requestChunks = [];
          if (reqChunkCount > 1 && !encryptedRequest) {
            const chunksRes = await fetch(
              `${baseUrl}/relayRequests/${encodeURIComponent(requestId)}/chunks`,
              { headers },
            );
            if (chunksRes.ok) {
              const chunksJson = await chunksRes.json();
              requestChunks = (chunksJson.documents || [])
                .filter((d) => d.fields?.direction?.stringValue === 'request')
                .map((d) => ({
                  index: Number(d.fields?.index?.integerValue || '0'),
                  total: Number(d.fields?.total?.integerValue || '1'),
                  direction: 'request',
                  data: d.fields?.data?.stringValue || '',
                }));
            }
          }
          const out = await this.handleEncryptedRequest({
            encryptedRequest,
            chunks: requestChunks,
          });
          const resChunks = out.responseChunks || [];
          if (resChunks.length > 1) {
            for (const ch of resChunks) {
              await fetch(
                `${baseUrl}/relayRequests/${encodeURIComponent(requestId)}/chunks?documentId=res_${ch.index}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...headers },
                  body: JSON.stringify({
                    fields: {
                      index: { integerValue: String(ch.index) },
                      total: { integerValue: String(ch.total) },
                      direction: { stringValue: 'response' },
                      data: { stringValue: ch.data },
                    },
                  }),
                },
              );
            }
          }
          const nowIso = new Date().toISOString();
          await fetch(`${baseUrl}/relayRequests/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              fields: {
                ...fields,
                status: { stringValue: 'succeeded' },
                updatedAt: { stringValue: nowIso },
                encryptedResponse: { stringValue: out.encryptedResponse || '' },
                responseChunkCount: {
                  integerValue: String(resChunks.length || 1),
                },
              },
            }),
          });
        } catch (err) {
          const nowIso = new Date().toISOString();
          await fetch(`${baseUrl}/relayRequests/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({
              fields: {
                ...fields,
                status: { stringValue: 'failed' },
                updatedAt: { stringValue: nowIso },
                errorMessage: { stringValue: err.message || String(err) },
              },
            }),
          });
        }
      }
    } catch {
      // ignore polling error
    } finally {
      this._pollingBusy = false;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.config.lastHeartbeatAt = new Date().toISOString();
    void this._publishHeartbeatToFirestore();
    this.heartbeatTimer = setInterval(() => {
      this.config.lastHeartbeatAt = new Date().toISOString();
      void this._publishHeartbeatToFirestore();
    }, 25_000);
    this.pollTimer = setInterval(() => {
      void this._pollFirestoreRequests();
    }, 1_500);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * 平文の中継リクエスト（RelayEnvelopePlaintext）を処理して RelayResponsePlaintext を返す。
   */
  async executePlainRequest(envelope) {
    const { requestId, kind, payload = {} } = envelope;
    try {
      let result = null;
      switch (kind) {
        case 'ping': {
          result = { pong: true, serverTime: new Date().toISOString() };
          break;
        }
        case 'search': {
          result = this.vaultEngine.search(payload.query || '', payload.limit || 200);
          break;
        }
        case 'listDiff': {
          const metas = this.vaultEngine.listMeta();
          result = shared.computeListDiff(metas, {}, payload.sinceUpdatedAt);
          break;
        }
        case 'getBody': {
          const rec = this.vaultEngine.getRecord(payload.thinkid);
          result = rec
            ? {
                thinkid: payload.thinkid,
                meta: rec.meta,
                body: rec.body,
                support: payload.includeSupport !== false ? rec.support : undefined,
              }
            : null;
          break;
        }
        case 'saveRecord': {
          result = this.vaultEngine.saveRecord(payload);
          break;
        }
        case 'deleteRecord': {
          this.vaultEngine.deleteRecord(payload.thinkid);
          result = { ok: true };
          break;
        }
        case 'ai.conversation':
        case 'ai.agent': {
          const profile = payload.profileId
            ? this.vaultEngine.getDomainProfileById(payload.profileId)
            : this.vaultEngine.getActiveDomainProfile();
          const bundleRec = payload.bundleId
            ? this.vaultEngine.getRecord(payload.bundleId)
            : null;
          result = await this.aiCliRunner.runDomainAiConversation({
            ...payload,
            cliName:
              payload.cliName ||
              payload.preferredCli ||
              this.vaultEngine.config.preferredCli ||
              'claude',
            model: payload.model || this.vaultEngine.config.preferredModel || undefined,
            profile,
            panelRole: payload.panelRole || 'Discuss',
            agentId: payload.agentId,
            bundleId: payload.bundleId || 'default',
            bundleTitle: bundleRec?.meta?.title || payload.bundleTitle || '中継リクエスト',
            bundleSummary: bundleRec?.support?.summary || payload.bundleSummary,
            userMessage: payload.userMessage || '',
          });
          break;
        }
        default:
          throw new Error(`未対応の中継操作種別です: ${kind}`);
      }

      this.config.processedCount = (this.config.processedCount || 0) + 1;
      return {
        requestId,
        kind,
        completedAt: new Date().toISOString(),
        ok: true,
        result,
      };
    } catch (err) {
      return {
        requestId,
        kind,
        completedAt: new Date().toISOString(),
        ok: false,
        error: err.message || String(err),
      };
    }
  }

  /**
   * E2EE 暗号化済み（またはチャンク分割済み）の中継リクエストを復号・実行し、
   * 暗号化応答（および分割チャンク）を返す。
   */
  async handleEncryptedRequest({ encryptedRequest, chunks }) {
    const cipherText =
      Array.isArray(chunks) && chunks.length > 0
        ? shared.reassembleChunks(chunks)
        : encryptedRequest;
    const envelope = await shared.decryptRelayPayload(cipherText, this.config.pairingSecret);
    const responsePlain = await this.executePlainRequest(envelope);
    const encryptedResponse = await shared.encryptRelayPayload(
      responsePlain,
      this.config.pairingSecret,
    );
    const responseChunks = shared.splitIntoChunks(encryptedResponse, 'response');
    return {
      encryptedResponse: responseChunks.length === 1 ? encryptedResponse : '',
      responseChunks,
    };
  }
}

module.exports = {
  RelayAgent,
};
