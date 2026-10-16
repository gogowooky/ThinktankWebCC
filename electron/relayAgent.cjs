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
  constructor({ userDataDir, vaultEngine, aiCliRunner }) {
    this.userDataDir = userDataDir;
    this.vaultEngine = vaultEngine;
    this.aiCliRunner = aiCliRunner;
    this.configPath = path.join(userDataDir, 'relay-agent-config.json');
    this.config = this._loadConfig();
    this.heartbeatTimer = null;
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
      firebaseUid: process.env.VITE_FIREBASE_UID || 'default_user',
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
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2) + '\n', 'utf8');
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
      firebaseUid: this.config.firebaseUid,
      lastHeartbeatAt: this.config.lastHeartbeatAt,
      isAlive: shared.isRelayHeartbeatAlive(this.config.lastHeartbeatAt),
      processedCount: this.config.processedCount,
      activeRelayConfig,
    };
  }

  _getFirestoreBaseUrl() {
    if (!this.config.firebaseProjectId) return null;
    const uid = this.config.firebaseUid || 'default_user';
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      this.config.firebaseProjectId,
    )}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
  }

  async _publishHeartbeatToFirestore() {
    const baseUrl = this._getFirestoreBaseUrl();
    if (!baseUrl || typeof fetch !== 'function') return;
    try {
      const nowIso = new Date().toISOString();
      this.config.lastHeartbeatAt = nowIso;
      await fetch(`${baseUrl}/config/activeRelay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            deviceId: { stringValue: this.config.deviceId },
            deviceName: { stringValue: this.config.deviceName },
            lastHeartbeatAt: { stringValue: nowIso },
          },
        }),
      });
    } catch {
      // ignore network error during heartbeat
    }
  }

  async _pollFirestoreRequests() {
    const baseUrl = this._getFirestoreBaseUrl();
    if (!baseUrl || typeof fetch !== 'function' || this._pollingBusy) return;
    this._pollingBusy = true;
    try {
      const res = await fetch(`${baseUrl}/relayRequests?pageSize=20`);
      if (!res.ok) return;
      const data = await res.json();
      const docs = data.documents || [];
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
        try {
          const out = await this.handleEncryptedRequest({
            encryptedRequest,
            chunks: [],
          });
          const nowIso = new Date().toISOString();
          await fetch(`${baseUrl}/relayRequests/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                ...fields,
                status: { stringValue: 'succeeded' },
                updatedAt: { stringValue: nowIso },
                encryptedResponse: { stringValue: out.encryptedResponse || '' },
                responseChunkCount: {
                  integerValue: String((out.responseChunks || []).length || 1),
                },
              },
            }),
          });
        } catch (err) {
          const nowIso = new Date().toISOString();
          await fetch(`${baseUrl}/relayRequests/${encodeURIComponent(requestId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
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
        case 'ai.conversation':
        case 'ai.agent': {
          const profile = payload.profileId
            ? this.vaultEngine.getDomainProfileById(payload.profileId)
            : this.vaultEngine.getActiveDomainProfile();
          const bundleRec = payload.bundleId
            ? this.vaultEngine.getRecord(payload.bundleId)
            : null;
          result = await this.aiCliRunner.runDomainAiConversation({
            cliName: payload.preferredCli || this.vaultEngine.config.preferredCli || 'claude',
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
