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
const { RecordingMcpHost } = require('./mcpBridge.cjs');
const kinakoRelay = require('./kinakoTokenRelay.cjs');

const HEARTBEAT_INTERVAL_MS = 60_000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const LISTENER_RETRY_MS = 5_000;
const KINAKO_RESULT_CACHE_LIMIT = 200;
const KINAKO_TIMEOUT_MS = 10 * 60_000;

async function loadFirebaseSdk() {
  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ]);
  return {
    initializeServerApp: appSdk.initializeServerApp,
    deleteApp: appSdk.deleteApp,
    getAuth: authSdk.getAuth,
    getFirestore: firestoreSdk.getFirestore,
    collection: firestoreSdk.collection,
    doc: firestoreSdk.doc,
    query: firestoreSdk.query,
    where: firestoreSdk.where,
    limit: firestoreSdk.limit,
    onSnapshot: firestoreSdk.onSnapshot,
    runTransaction: firestoreSdk.runTransaction,
    getDocs: firestoreSdk.getDocs,
    setDoc: firestoreSdk.setDoc,
    terminate: firestoreSdk.terminate,
  };
}

class RelayAgent {
  constructor({
    userDataDir,
    vaultEngine,
    aiCliRunner,
    firebaseApiKey,
    firestoreSdkLoader,
    isLocalMode = false,
    getKinakoRelayDir,
  }) {
    this.userDataDir = userDataDir;
    this.vaultEngine = vaultEngine;
    this.aiCliRunner = aiCliRunner;
    this.configPath = path.join(userDataDir, 'relay-agent-config.json');
    this.config = this._loadConfig();
    // パッケージ版のメインプロセスには .env が無いので、画面側から受け取って保存した値も使う
    this.firebaseApiKey =
      firebaseApiKey || process.env.VITE_FIREBASE_API_KEY || this.config.firebaseApiKey || '';
    this.heartbeatTimer = null;
    // 画面の「オンライン」表示は、Firestore への書き込みに実際に成功した時刻だけで判断する
    this.lastFirestoreOkAt = '';
    /** @type {{ uid: string, email: string, idToken: string, refreshToken: string, expiresAtMs: number } | null} */
    this.authSession = null;
    this._authRefreshing = null;
    this._lastFirestoreProblem = '';
    this._firestoreSdkLoader = firestoreSdkLoader || loadFirebaseSdk;
    this._firestoreUnsubscribe = null;
    this._firestoreApp = null;
    this._firestoreDb = null;
    this._firestoreSdk = null;
    this._firestoreListenerReady = false;
    this._listenerGeneration = 0;
    this._listenerRetryTimer = null;
    this._listenerRenewTimer = null;
    this._activeRequests = new Set();
    this._inFlightRequestIds = new Set();
    this._processingCount = 0;
    /** きなこ依頼の結果を requestId で覚え、再送されても二重実行しない。 */
    this.kinakoResultsPath = path.join(userDataDir, 'kinako-results.json');
    this._kinakoResults = null;
    this._kinakoInFlight = new Map();
    this.mcpHost = null;
    // きなこ専用アカウントのセッション。所有者の authSession とは混ぜない
    this.isLocalMode = Boolean(isLocalMode);
    // Drive のマウントは起動より遅れることがあるので、書くたびに解決する
    this._getKinakoRelayDir = typeof getKinakoRelayDir === 'function' ? getKinakoRelayDir : () => '';
    /** @type {{ uid: string, email: string, idToken: string, refreshToken: string, expiresAtMs: number } | null} */
    this.kinakoSession = null;
    this._kinakoIssuedAtMs = 0;
    this._kinakoWrittenToken = '';
    this._kinakoSyncing = null;
    this._kinakoTimer = null;
    this._kinakoProblem = '';
  }

  /** mcp.toolCall / kinako.request の実行先。ホストはメインプロセスが作るため後から受け取る。 */
  setMcpHost(mcpHost) {
    this.mcpHost = mcpHost || null;
  }

  _loadKinakoResults() {
    if (this._kinakoResults) return this._kinakoResults;
    this._kinakoResults = new Map();
    try {
      const raw = JSON.parse(fs.readFileSync(this.kinakoResultsPath, 'utf8'));
      for (const item of Array.isArray(raw) ? raw : []) {
        if (item && typeof item.requestId === 'string') this._kinakoResults.set(item.requestId, item);
      }
    } catch {
      // 無い・壊れている場合は空から始める
    }
    return this._kinakoResults;
  }

  _rememberKinakoResult(result) {
    const map = this._loadKinakoResults();
    map.delete(result.requestId);
    map.set(result.requestId, result);
    while (map.size > KINAKO_RESULT_CACHE_LIMIT) {
      map.delete(map.keys().next().value);
    }
    try {
      fs.mkdirSync(path.dirname(this.kinakoResultsPath), { recursive: true });
      fs.writeFileSync(this.kinakoResultsPath, JSON.stringify([...map.values()], null, 2), 'utf8');
    } catch (err) {
      console.warn(`[Relay] きなこ依頼の結果を保存できませんでした: ${err.message || err}`);
    }
  }

  _kinakoFailure(envelope, code, message, partial = {}) {
    return {
      requestId: envelope.requestId,
      targetPc: envelope.targetPc,
      status: 'failed',
      createdThinkIds: [],
      updatedThinkIds: [],
      candidateIds: [],
      usedSourceIds: [],
      conflicts: [],
      failure: { code, message },
      completedAt: new Date().toISOString(),
      ...partial,
    };
  }

  /**
   * きなこの非同期依頼（shared/kinakoRequest.ts）を実行する。
   * - 宛先PCが自分でなければ実行せず failed（PC間で材料を混ぜない）
   * - 同じ requestId は結果を返すだけで再実行しない
   * - 結果は AI の自己申告ではなく、実際のツール呼び出し（RecordingMcpHost）から組み立てる
   */
  async executeKinakoRequest(rawEnvelope) {
    const validation = shared.validateKinakoRequestEnvelope(rawEnvelope);
    const requestIdHint =
      rawEnvelope && typeof rawEnvelope.requestId === 'string' ? rawEnvelope.requestId : 'unknown';
    if (validation.status === 'error') {
      return this._kinakoFailure(
        { requestId: requestIdHint, targetPc: String(rawEnvelope?.targetPc || '') },
        'INVALID_ARGUMENT',
        validation.message,
      );
    }
    const envelope = validation.value;

    if (
      !shared.matchesTargetPc(envelope.targetPc, {
        deviceId: this.config.deviceId,
        deviceName: this.config.deviceName,
      })
    ) {
      return this._kinakoFailure(
        envelope,
        'TARGET_PC_MISMATCH',
        `この依頼の宛先は「${envelope.targetPc}」で、このPC（${this.config.deviceId}）ではありません。`,
      );
    }
    if (envelope.mode !== 'web') {
      return this._kinakoFailure(
        envelope,
        'INVALID_ARGUMENT',
        'Firestore 中継で受け付けるのは mode: web の依頼だけです（Local版は依頼書を PC 上の AI へ渡します）。',
      );
    }
    if (!this.mcpHost) {
      return this._kinakoFailure(envelope, 'INTERNAL_ERROR', 'MCP ホストが初期化されていません。');
    }

    const cached = this._loadKinakoResults().get(envelope.requestId);
    if (cached) return cached;
    const running = this._kinakoInFlight.get(envelope.requestId);
    if (running) return running;

    const promise = this._runKinakoRequest(envelope).finally(() => {
      this._kinakoInFlight.delete(envelope.requestId);
    });
    this._kinakoInFlight.set(envelope.requestId, promise);
    return promise;
  }

  async _runKinakoRequest(envelope) {
    const host = new RecordingMcpHost(this.mcpHost);
    const projectRec = envelope.projectId ? this.vaultEngine.getRecord(envelope.projectId) : null;
    if (envelope.projectId && !projectRec) {
      return this._kinakoFailure(envelope, 'NOT_FOUND', `対象 Project が見つかりません: ${envelope.projectId}`);
    }

    let reply = '';
    let aiError = null;
    try {
      const profile = this.vaultEngine.getActiveDomainProfile();
      const ai = await this.aiCliRunner.runDomainAiConversation({
        cliName: this.vaultEngine.config.preferredCli || 'claude',
        model: this.vaultEngine.config.preferredModel || undefined,
        profile,
        panelRole: 'Working',
        bundleId: envelope.projectId || 'default',
        bundleTitle: projectRec?.meta?.title || `きなこ依頼 ${envelope.requestId}`,
        bundleSummary: projectRec?.support?.summary,
        userMessage: shared.buildKinakoRequestPrompt(envelope),
        timeoutMs: KINAKO_TIMEOUT_MS,
        requestId: envelope.requestId,
        projectId: envelope.projectId,
        mcpHost: host,
      });
      reply = typeof ai?.reply === 'string' ? ai.reply : '';
    } catch (err) {
      aiError = err;
    }

    const r = host.recorded;
    const wroteSomething =
      r.createdThinkIds.length > 0 || r.updatedThinkIds.length > 0 || r.candidateIds.length > 0;
    const base = {
      requestId: envelope.requestId,
      targetPc: envelope.targetPc,
      createdThinkIds: r.createdThinkIds,
      updatedThinkIds: r.updatedThinkIds,
      candidateIds: r.candidateIds,
      usedSourceIds: r.usedSourceIds,
      conflicts: r.conflicts,
      ...(reply ? { summary: reply } : {}),
      completedAt: new Date().toISOString(),
    };

    let result;
    if (aiError) {
      result = {
        ...base,
        status: 'failed',
        failure: {
          code: 'AI_EXECUTION_FAILED',
          message: aiError.message || String(aiError),
        },
      };
    } else if (r.conflicts.length > 0) {
      result = { ...base, status: 'conflict' };
    } else {
      result = { ...base, status: 'done' };
    }

    // 何も書かずに失敗しただけなら、同じ requestId での再送で再実行できるよう覚えない。
    if (result.status !== 'failed' || wroteSomething) this._rememberKinakoResult(result);
    return result;
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
      kinakoEmail: kinakoRelay.KINAKO_EMAIL,
      kinakoRefreshToken: '',
      lastHeartbeatAt: new Date().toISOString(),
      processedCount: 0,
    };
    let config = base;
    if (fs.existsSync(this.configPath)) {
      try {
        const loaded = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        config = { ...base, ...loaded };
      } catch {
        config = base;
      }
    }
    // 端末 id は VaultEngine が一元管理する（索引シャード名と中継の宛先を一致させるため）
    if (this.vaultEngine?.config?.deviceId) {
      config.deviceId = this.vaultEngine.config.deviceId;
    }
    return config;
  }

  /** 保存済みの設定で中継役が有効なら、起動時に待ち受けを再開する。 */
  start() {
    if (this.config.enabled) {
      this._startHeartbeat();
    }
    void this._updateKinakoRelay();
  }

  stop() {
    this._stopHeartbeat();
    this._stopKinakoTimer();
  }

  saveConfig(partial) {
    this.config = { ...this.config, ...partial };
    this._persistConfig();
    if (this.config.enabled) {
      this._startHeartbeat();
    } else {
      this._stopHeartbeat();
    }
    void this._updateKinakoRelay();
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
      lastHeartbeatAt: this.lastFirestoreOkAt,
      isAlive: this.config.enabled && shared.isRelayHeartbeatAlive(this.lastFirestoreOkAt),
      firestoreProblem: this._lastFirestoreProblem || '',
      processedCount: this.config.processedCount,
      isProcessing: this._processingCount > 0,
      activeRelayConfig,
    };
  }

  /** Renderer の Firebase SDK セッションを同じ利用者へ揃えるための保存済み資格情報。 */
  getFirebaseSession() {
    if (!this.config.firebaseRefreshToken || !this.firebaseApiKey || !this.config.firebaseUid) {
      return null;
    }
    return {
      refreshToken: this.config.firebaseRefreshToken,
      email: this.config.firebaseEmail || '',
      apiKey: this.firebaseApiKey,
      uid: this.config.firebaseUid,
    };
  }

  /**
   * ログインページ（常駐エージェント）または Electron 版の画面から受け取った Firebase の refresh token を
   * 検証して保存する。Firestore のルールが users/{uid} を本人だけに許すため、Web版と同じ Google アカウントの uid が要る。
   */
  async setFirebaseRefreshToken(refreshToken, email = '', apiKey = '') {
    if (apiKey && apiKey !== this.firebaseApiKey) {
      this.firebaseApiKey = apiKey;
      this.config.firebaseApiKey = apiKey;
    }
    if (!this.firebaseApiKey) {
      throw new Error('VITE_FIREBASE_API_KEY が設定されていません。');
    }
    const session = await shared.refreshFirebaseIdToken(this.firebaseApiKey, refreshToken, email);
    this.authSession = session;
    this._lastFirestoreProblem = '';
    this.saveConfig({
      firebaseUid: session.uid,
      firebaseEmail: email,
      firebaseRefreshToken: session.refreshToken,
    });
    return this.getStatus();
  }

  signOutFirebase() {
    this._stopHeartbeat();
    this.authSession = null;
    this.lastFirestoreOkAt = '';
    return this.saveConfig({
      enabled: false,
      firebaseUid: '',
      firebaseEmail: '',
      firebaseRefreshToken: '',
    });
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

  // ── きなこ連携（認証トークンの中継） ──────────────────────────────────────

  /**
   * きなこ専用アカウントでサインインし、リフレッシュトークンだけを保存する。
   * パスワードは保存もログ出力もしない（きなこ側にも渡さない）。
   */
  async setKinakoPassword(password) {
    if (this.isLocalMode) {
      throw new Error('ローカル運用モードでは きなこ連携（認証）を使えません。');
    }
    if (typeof password !== 'string' || !password) {
      throw new Error('パスワードを入力してください。');
    }
    if (!this.firebaseApiKey) {
      throw new Error('VITE_FIREBASE_API_KEY が設定されていません。');
    }
    const session = await shared.signInWithEmailPassword(
      this.firebaseApiKey,
      kinakoRelay.KINAKO_EMAIL,
      password,
    );
    this.kinakoSession = session;
    this._kinakoIssuedAtMs = Date.now();
    this.config.kinakoEmail = kinakoRelay.KINAKO_EMAIL;
    this.config.kinakoRefreshToken = session.refreshToken;
    // saveConfig は所有者側の待ち受けを張り直すので使わない
    this._persistConfig();
    await this._updateKinakoRelay();
    return this.getKinakoAuthStatus();
  }

  /** 画面表示用。トークン文字列そのものは返さない。 */
  getKinakoAuthStatus() {
    const connected = !this.isLocalMode && Boolean(this.config.kinakoRefreshToken);
    return {
      connected,
      email: this.config.kinakoEmail || kinakoRelay.KINAKO_EMAIL,
      tokenExpiresAt:
        connected && this.kinakoSession ? new Date(this.kinakoSession.expiresAtMs).toISOString() : '',
      localMode: this.isLocalMode,
      relayEnabled: Boolean(this.config.enabled),
      tokenFileWritten: Boolean(this._kinakoWrittenToken),
      problem: this._kinakoProblem,
    };
  }

  async signOutKinako() {
    this.kinakoSession = null;
    this._kinakoIssuedAtMs = 0;
    this._kinakoProblem = '';
    this.config.kinakoRefreshToken = '';
    this._persistConfig();
    await this._updateKinakoRelay();
    return this.getKinakoAuthStatus();
  }

  _isKinakoRelayActive() {
    return (
      !this.isLocalMode &&
      Boolean(this.config.enabled && this.config.kinakoRefreshToken && this.firebaseApiKey)
    );
  }

  _kinakoTokenFilePath() {
    const dir = this._getKinakoRelayDir();
    return dir ? kinakoRelay.tokenFilePath(dir, this.config.deviceId) : '';
  }

  _removeKinakoTokenFile() {
    this._kinakoWrittenToken = '';
    const filePath = this._kinakoTokenFilePath();
    if (!filePath) return;
    try {
      kinakoRelay.removeTokenFile(filePath);
    } catch (err) {
      console.warn(`[RelayAgent] きなこ用トークンファイルを削除できません: ${err.message || err}`);
    }
  }

  _stopKinakoTimer() {
    if (this._kinakoTimer) {
      clearInterval(this._kinakoTimer);
      this._kinakoTimer = null;
    }
  }

  /**
   * PC連携が ON で きなこ接続済みの間だけ、ハートビートと同じ間隔でトークンファイルを保つ。
   * 所有者が未ログインでも動くよう、所有者側のハートビートとは別のタイマーにしている。
   */
  _updateKinakoRelay() {
    this._stopKinakoTimer();
    if (this._isKinakoRelayActive()) {
      this._kinakoTimer = setInterval(() => {
        void this._syncKinakoTokenFile();
      }, HEARTBEAT_INTERVAL_MS);
    }
    return this._syncKinakoTokenFile();
  }

  _syncKinakoTokenFile() {
    if (!this._kinakoSyncing) {
      this._kinakoSyncing = this._syncKinakoTokenFileOnce().finally(() => {
        this._kinakoSyncing = null;
      });
    }
    return this._kinakoSyncing;
  }

  async _syncKinakoTokenFileOnce() {
    if (!this._isKinakoRelayActive()) {
      this._removeKinakoTokenFile();
      return;
    }
    const refreshToken = this.config.kinakoRefreshToken;
    try {
      if (!this.kinakoSession || shared.needsFirebaseTokenRefresh(this.kinakoSession)) {
        const session = await shared.refreshFirebaseIdToken(
          this.firebaseApiKey,
          refreshToken,
          this.config.kinakoEmail || kinakoRelay.KINAKO_EMAIL,
        );
        // 更新を待つ間に切断・OFF されていたら、消したトークンを書き戻さない
        if (this.config.kinakoRefreshToken !== refreshToken || !this._isKinakoRelayActive()) {
          this._removeKinakoTokenFile();
          return;
        }
        this.kinakoSession = session;
        this._kinakoIssuedAtMs = Date.now();
        if (session.refreshToken !== refreshToken) {
          this.config.kinakoRefreshToken = session.refreshToken;
          this._persistConfig();
        }
      }
      const filePath = this._kinakoTokenFilePath();
      if (!filePath) {
        this._reportKinakoProblem(
          'Google Drive の Thinktank フォルダが見つからないため、トークンファイルを書き出せません。',
        );
        return;
      }
      const session = this.kinakoSession;
      if (this._kinakoWrittenToken !== session.idToken || !fs.existsSync(filePath)) {
        kinakoRelay.writeTokenFileAtomic(
          filePath,
          kinakoRelay.buildTokenFileContent({
            deviceId: this.config.deviceId,
            idToken: session.idToken,
            expiresAtMs: session.expiresAtMs,
            issuedAtMs: this._kinakoIssuedAtMs,
          }),
        );
        this._kinakoWrittenToken = session.idToken;
      }
      this._reportKinakoProblem('');
    } catch (err) {
      // 期限切れのトークンは きなこ側で使えないので、残さない
      if (!this.kinakoSession || Date.now() >= this.kinakoSession.expiresAtMs) {
        this._removeKinakoTokenFile();
      }
      this._reportKinakoProblem(`きなこ用トークンを更新できません: ${err.message || err}`);
    }
  }

  _reportKinakoProblem(message) {
    if (message === this._kinakoProblem) return;
    this._kinakoProblem = message;
    if (message) console.warn(`[RelayAgent] ${message}`);
  }

  _persistConfig() {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2) + '\n', 'utf8');
  }

  // 再接続時に同じ失敗を出し続けないよう、状態が変わったときだけ表示する
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
    if (!this.config.enabled) return;
    const ctx = await this._getFirestoreContext();
    if (!ctx) return;
    const nowIso = new Date().toISOString();
    const body = JSON.stringify({
      fields: {
        deviceId: { stringValue: this.config.deviceId },
        deviceName: { stringValue: this.config.deviceName },
        lastHeartbeatAt: { stringValue: nowIso },
      },
    });
    try {
      const deviceRes = await fetch(
        `${ctx.baseUrl}/devices/${encodeURIComponent(this.config.deviceId)}`,
        {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...ctx.headers },
        body,
        },
      );
      if (!deviceRes.ok) {
        this._reportFirestoreProblem(
          `ハートビートの書き込みに失敗しました (HTTP ${deviceRes.status})`,
        );
        return;
      }
      this.lastFirestoreOkAt = nowIso;
      this.config.lastHeartbeatAt = nowIso;
      this._reportFirestoreProblem('');
    } catch (err) {
      this._reportFirestoreProblem(`Firestore に接続できません: ${err.message || err}`);
    }
  }

  _expiresAtMs(value) {
    if (typeof value === 'string') return Date.parse(value);
    if (typeof value === 'number') return value;
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    return Number.NaN;
  }

  async _claimAndProcessFirestoreRequest(
    sdk,
    db,
    requestRef,
    generation = this._listenerGeneration,
  ) {
    // OFF後にsnapshot由来の直列queueが残っていても、新しい依頼をclaimしない。
    if (!this.config.enabled || generation !== this._listenerGeneration) return;
    this._processingCount += 1;
    let claimed = false;
    try {
      const claim = await sdk.runTransaction(db, async (transaction) => {
        if (!this.config.enabled || generation !== this._listenerGeneration) return null;
        const snapshot = await transaction.get(requestRef);
        if (!snapshot.exists()) return null;
        const data = snapshot.data() || {};
        if (data.status !== 'queued' || data.targetDeviceId !== this.config.deviceId) return null;

        const nowIso = new Date().toISOString();
        const expiresAtMs = this._expiresAtMs(data.expiresAt);
        if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
          transaction.update(requestRef, { status: 'expired', updatedAt: nowIso });
          return null;
        }

        transaction.update(requestRef, {
          status: 'running',
          claimedBy: this.config.deviceId,
          claimedAt: nowIso,
          updatedAt: nowIso,
        });
        return { ...data, requestId: data.requestId || snapshot.id };
      });
      if (!claim) return;
      claimed = true;

      // claim直後に利用者がPC連携をOFFにした場合は、AI CLIを起動せず終了する。
      if (!this.config.enabled || generation !== this._listenerGeneration) {
        await sdk.runTransaction(db, async (transaction) => {
          const latest = await transaction.get(requestRef);
          if (!latest.exists()) return;
          const latestData = latest.data() || {};
          if (
            latestData.status === 'running' &&
            latestData.claimedBy === this.config.deviceId
          ) {
            transaction.update(requestRef, {
              status: 'canceled',
              updatedAt: new Date().toISOString(),
              errorMessage: 'PC連携がOFFになりました。',
            });
          }
        });
        return;
      }

      const encryptedRequest = claim.encryptedRequest || '';
      const reqChunkCount = Number(claim.requestChunkCount || 1);
      let requestChunks = [];
      if (reqChunkCount > 1 && !encryptedRequest) {
        const chunksSnapshot = await sdk.getDocs(sdk.collection(requestRef, 'chunks'));
        requestChunks = chunksSnapshot.docs
          .map((chunkSnapshot) => chunkSnapshot.data() || {})
          .filter((chunk) => chunk.direction === 'request')
          .map((chunk) => ({
            index: Number(chunk.index || 0),
            total: Number(chunk.total || 1),
            direction: 'request',
            data: chunk.data || '',
          }));
      }

      const out = await this.handleEncryptedRequest({ encryptedRequest, chunks: requestChunks });

      // 実行中にOFFへ切り替わった場合も、後続queueを進めず応答を破棄する。
      if (!this.config.enabled || generation !== this._listenerGeneration) {
        await sdk.runTransaction(db, async (transaction) => {
          const latest = await transaction.get(requestRef);
          if (!latest.exists()) return;
          const latestData = latest.data() || {};
          if (
            latestData.status === 'running' &&
            latestData.claimedBy === this.config.deviceId
          ) {
            transaction.update(requestRef, {
              status: 'canceled',
              updatedAt: new Date().toISOString(),
              errorMessage: 'PC連携がOFFになりました。',
            });
          }
        });
        return;
      }
      const responseChunks = out.responseChunks || [];
      if (responseChunks.length > 1) {
        for (const chunk of responseChunks) {
          await sdk.setDoc(sdk.doc(requestRef, 'chunks', `res_${chunk.index}`), {
            index: chunk.index,
            total: chunk.total,
            direction: 'response',
            data: chunk.data,
          });
        }
      }

      await sdk.runTransaction(db, async (transaction) => {
        const latest = await transaction.get(requestRef);
        if (!latest.exists()) return;
        const latestData = latest.data() || {};
        if (
          latestData.status !== 'running' ||
          latestData.claimedBy !== this.config.deviceId
        ) {
          return;
        }
        transaction.update(requestRef, {
          status: 'succeeded',
          updatedAt: new Date().toISOString(),
          encryptedResponse: out.encryptedResponse || '',
          responseChunkCount: responseChunks.length || 1,
        });
      });
    } catch (err) {
      if (claimed) {
        try {
          await sdk.runTransaction(db, async (transaction) => {
            const latest = await transaction.get(requestRef);
            if (!latest.exists()) return;
            const latestData = latest.data() || {};
            if (
              latestData.status !== 'running' ||
              latestData.claimedBy !== this.config.deviceId
            ) {
              return;
            }
            transaction.update(requestRef, {
              status: 'failed',
              updatedAt: new Date().toISOString(),
              errorMessage: err && err.message ? err.message : String(err),
            });
          });
        } catch (updateErr) {
          this._reportFirestoreProblem(
            `中継リクエストの失敗状態を保存できません: ${updateErr.message || updateErr}`,
          );
        }
      } else {
        this._reportFirestoreProblem(
          `中継リクエストを取得できません: ${err && err.message ? err.message : err}`,
        );
      }
    } finally {
      this._processingCount -= 1;
    }
  }

  _queueFirestoreSnapshot(snapshot, sdk, db, generation) {
    if (generation !== this._listenerGeneration) return;
    this._firestoreListenerReady = true;
    this._reportFirestoreProblem('');
    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue;
      const requestRef = change.doc.ref;
      const requestKey =
        (change.doc && change.doc.id) ||
        (requestRef && (requestRef.id || requestRef.path)) ||
        null;
      if (requestKey && this._inFlightRequestIds.has(requestKey)) continue;
      if (requestKey) this._inFlightRequestIds.add(requestKey);

      const task = Promise.resolve()
        .then(() => this._claimAndProcessFirestoreRequest(sdk, db, requestRef, generation))
        .catch((err) => {
          this._reportFirestoreProblem(
            `中継リクエストの処理に失敗しました: ${err && err.message ? err.message : err}`,
          );
        })
        .finally(() => {
          if (requestKey) this._inFlightRequestIds.delete(requestKey);
          this._activeRequests.delete(task);
        });
      this._activeRequests.add(task);
    }
  }

  _scheduleFirestoreListenerRestart(generation, delayMs = LISTENER_RETRY_MS) {
    if (generation !== this._listenerGeneration || this._listenerRetryTimer) return;
    this._listenerRetryTimer = setTimeout(() => {
      this._listenerRetryTimer = null;
      if (
        generation !== this._listenerGeneration ||
        !this.config.enabled ||
        !this.config.firebaseRefreshToken
      ) {
        return;
      }
      if (this._processingCount > 0) {
        this._scheduleFirestoreListenerRestart(generation, LISTENER_RETRY_MS);
        return;
      }
      this._restartFirestoreListener();
    }, delayMs);
  }

  _restartFirestoreListener() {
    this._stopFirestoreListener();
    if (
      !this.config.enabled ||
      !this.config.firebaseProjectId ||
      !this.config.firebaseRefreshToken ||
      !this.firebaseApiKey
    ) {
      return;
    }
    const generation = this._listenerGeneration;
    void this._startFirestoreListener(generation);
  }

  async _startFirestoreListener(generation) {
    let sdk = null;
    let serverApp = null;
    let db = null;
    try {
      const auth = await this._getAuth();
      if (!auth || generation !== this._listenerGeneration || !this.config.enabled) return;
      sdk = await this._firestoreSdkLoader();
      if (generation !== this._listenerGeneration || !this.config.enabled) return;

      serverApp = sdk.initializeServerApp(
        {
          apiKey: this.firebaseApiKey,
          authDomain: `${this.config.firebaseProjectId}.firebaseapp.com`,
          projectId: this.config.firebaseProjectId,
        },
        { authIdToken: auth.idToken },
      );
      const serverAuth = sdk.getAuth(serverApp);
      if (typeof serverAuth.authStateReady === 'function') {
        await serverAuth.authStateReady();
      }
      if (!serverAuth.currentUser || serverAuth.currentUser.uid !== auth.uid) {
        throw new Error('Firebase の利用者セッションを復元できませんでした。');
      }
      db = sdk.getFirestore(serverApp);
      if (generation !== this._listenerGeneration || !this.config.enabled) {
        this._disposeFirestoreResources(sdk, db, serverApp, Promise.resolve());
        return;
      }

      const requests = sdk.collection(db, 'users', auth.uid, 'relayRequests');
      const queuedForThisDevice = sdk.query(
        requests,
        sdk.where('targetDeviceId', '==', this.config.deviceId),
        sdk.where('status', '==', 'queued'),
        sdk.limit(20),
      );

      this._firestoreSdk = sdk;
      this._firestoreApp = serverApp;
      this._firestoreDb = db;
      const unsubscribe = sdk.onSnapshot(
        queuedForThisDevice,
        (snapshot) => this._queueFirestoreSnapshot(snapshot, sdk, db, generation),
        (err) => {
          if (generation !== this._listenerGeneration) return;
          this._firestoreListenerReady = false;
          this._reportFirestoreProblem(
            `Firestore の中継待ち受けが停止しました: ${err && err.message ? err.message : err}`,
          );
          this._scheduleFirestoreListenerRestart(generation);
        },
      );
      if (generation !== this._listenerGeneration || !this.config.enabled) {
        unsubscribe();
        this._disposeFirestoreResources(sdk, db, serverApp, Promise.resolve());
        return;
      }
      this._firestoreUnsubscribe = unsubscribe;

      const renewDelay = Math.max(
        1_000,
        auth.expiresAtMs - Date.now() - TOKEN_REFRESH_MARGIN_MS,
      );
      this._listenerRenewTimer = setTimeout(() => {
        this._listenerRenewTimer = null;
        this._scheduleFirestoreListenerRestart(generation, 0);
      }, renewDelay);
    } catch (err) {
      if (sdk && (db || serverApp)) {
        this._disposeFirestoreResources(sdk, db, serverApp, Promise.resolve());
      }
      if (generation !== this._listenerGeneration || !this.config.enabled) return;
      this._firestoreListenerReady = false;
      this._reportFirestoreProblem(
        `Firestore の中継待ち受けを開始できません: ${err && err.message ? err.message : err}`,
      );
      this._scheduleFirestoreListenerRestart(generation);
    }
  }

  _disposeFirestoreResources(sdk, db, serverApp, pendingRequests) {
    void Promise.resolve(pendingRequests)
      .catch(() => {})
      .then(async () => {
        if (db && typeof sdk.terminate === 'function') {
          await sdk.terminate(db).catch(() => {});
        }
        if (serverApp && typeof sdk.deleteApp === 'function') {
          await sdk.deleteApp(serverApp).catch(() => {});
        }
      });
  }

  _stopFirestoreListener() {
    this._listenerGeneration += 1;
    this._firestoreListenerReady = false;
    if (this._listenerRetryTimer) {
      clearTimeout(this._listenerRetryTimer);
      this._listenerRetryTimer = null;
    }
    if (this._listenerRenewTimer) {
      clearTimeout(this._listenerRenewTimer);
      this._listenerRenewTimer = null;
    }
    if (this._firestoreUnsubscribe) {
      this._firestoreUnsubscribe();
      this._firestoreUnsubscribe = null;
    }
    const sdk = this._firestoreSdk;
    const db = this._firestoreDb;
    const serverApp = this._firestoreApp;
    const pendingRequests = Promise.allSettled([...this._activeRequests]);
    this._firestoreSdk = null;
    this._firestoreDb = null;
    this._firestoreApp = null;
    if (sdk && (db || serverApp)) {
      this._disposeFirestoreResources(sdk, db, serverApp, pendingRequests);
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    if (!this.config.enabled) return;
    if (
      !this.config.firebaseProjectId ||
      !this.config.firebaseRefreshToken ||
      !this.firebaseApiKey
    ) {
      this._reportFirestoreProblem(
        'Firebase 未ログインのため Firestore 中継を待ち受けていません。ログインページでログインしてください。',
      );
      return;
    }
    void this._publishHeartbeatToFirestore();
    this.heartbeatTimer = setInterval(() => {
      void this._publishHeartbeatToFirestore();
    }, HEARTBEAT_INTERVAL_MS);
    const generation = this._listenerGeneration;
    void this._startFirestoreListener(generation);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this._stopFirestoreListener();
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
          if (payload.provider === 'gnb') {
            result = await this.aiCliRunner.runGeminiNotebookConversation({
              notebookId: payload.model,
              userMessage: payload.userMessage || '',
              timeoutMs: payload.timeoutMs,
            });
            break;
          }
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
            panelRole: payload.panelRole || 'Working',
            agentId: payload.agentId,
            bundleId: payload.bundleId || 'default',
            bundleTitle: bundleRec?.meta?.title || payload.bundleTitle || '中継リクエスト',
            bundleSummary: bundleRec?.support?.summary || payload.bundleSummary,
            userMessage: payload.userMessage || '',
          });
          break;
        }
        case 'mcp.toolCall': {
          if (!this.mcpHost) throw new Error('MCP ホストが初期化されていません。');
          const toolName = typeof payload.name === 'string' ? payload.name : '';
          const toolResult = await shared.executeMcpToolCall(toolName, payload.arguments, this.mcpHost);
          const text = toolResult.content?.[0]?.text ?? '';
          let parsed = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // JSON でない本文はそのまま返す
          }
          result = { isError: Boolean(toolResult.isError), payload: parsed };
          break;
        }
        case 'kinako.request': {
          result = await this.executeKinakoRequest(payload);
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
