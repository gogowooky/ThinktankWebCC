'use strict';

const { app, BrowserWindow, ipcMain, session, dialog, protocol, shell, net: electronNet } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { pathToFileURL } = require('url');
const { validateOpenPath } = require('./openPath.cjs');
const { validateShortcutPath } = require('./shortcutPath.cjs');
const { VaultEngine } = require('./vaultEngine.cjs');
const aiCliRunner = require('./aiCliRunner.cjs');
const { RelayAgent } = require('./relayAgent.cjs');
const { resolveKinakoRelayDir } = require('./kinakoTokenRelay.cjs');
const { McpHttpServer } = require('./mcpHttpServer.cjs');
const { ThinktankMcpHost } = require('./mcpBridge.cjs');
const { loadDesktopClient, signInWithGoogleLoopback } = require('./googleLoopbackAuth.cjs');
const appMode = require('./appMode.cjs');
const { perfEnabled, perfMark, perfTime } = require('./perfLog.cjs');

perfMark('modules-loaded');

const GOOGLE_DESKTOP_CLIENT_FILE = 'google-oauth-desktop.json';
const shared = require('./shared-dist/index.js');

// パッケージ版（electron-builder）は package.json の "name" からアプリ名・userDataパスを
// 自動的に決定するが、開発時（`electron electron/main.cjs` を直接起動）は同じ仕組みが
// 働かず、Electron既定の "Electron" にフォールバックしてしまう。userDataパスが
// dev/パッケージ版で食い違わないよう、ここで明示的に固定する（app.getPath('userData')
// を呼ぶ前に設定する必要がある）。
app.setName('thinktank');

// ── カスタムプロトコル app://thinktank/ の特権登録（システム設計メモ §12.2） ──
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

// ── 多重起動防止（システム設計メモ §12.3） ──────────────────────────────────
// ローカル Vault ファイルへの同時書き込み競合や複数の中継役プロセス乱立を防ぐため、
// 単一インスタンスロックを取得する（セルフトest実行時を除く）。
if (process.env.TT_SELFTEST !== '1') {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        const w = wins[0];
        if (w.isMinimized()) w.restore();
        w.focus();
      }
    });
  }
}

const isDev = process.env.NODE_ENV === 'development';

/**
 * アプリのルートディレクトリ。
 *   開発時        : <repo>/electron/main.cjs   → <repo>
 *   パッケージ版  : resources/app/electron/main.cjs → resources/app
 * どちらも __dirname の 1 つ上で一致する。
 *
 * app.getAppPath() は使わないこと。開発時（electron に main.cjs のパスを直接渡す起動）
 * では <repo>/electron を返し、リポジトリ直下にならないため dist や docs を取り違える。
 */
function appRoot() {
  return path.join(__dirname, '..');
}

function resolveDefaultVaultDir() {
  if (process.env.THINKTANK_VAULT_DIR) {
    return process.env.THINKTANK_VAULT_DIR;
  }
  const gDriveCandidates = [
    'G:\\マイドライブ\\Thinktank\\vault_ver2',
    'G:\\My Drive\\Thinktank\\vault_ver2',
  ];
  for (const candidate of gDriveCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(app.getPath('userData'), 'thinktank', 'vault_ver2');
}

const DEFAULT_VAULT_DIR = resolveDefaultVaultDir();

/**
 * 今回の起動の運用モード。起動中は変えない（切り替えは再起動）。
 * ThinkファイルFolder を用意できなければ、設定は残したまま今回だけ Firestore で起動する。
 */
function resolveStartupMode() {
  const saved = appMode.loadAppMode(app.getPath('userData'));
  if (saved.storageMode !== 'local') return { storageMode: 'firestore', localVaultDir: '', startupProblem: '' };
  const backupRoot = appMode.resolveBackupVaultRoot(app.getPath('userData'), DEFAULT_VAULT_DIR);
  const verdict = appMode.validateLocalVaultDir(saved.localVaultDir, backupRoot);
  if (!verdict.ok) return { storageMode: 'firestore', localVaultDir: '', startupProblem: verdict.error };
  try {
    appMode.prepareLocalVaultDir(verdict.resolved);
  } catch (err) {
    return {
      storageMode: 'firestore',
      localVaultDir: '',
      startupProblem: `ThinkファイルFolder を用意できませんでした（${verdict.resolved}）: ${err.message || err}`,
    };
  }
  return { storageMode: 'local', localVaultDir: verdict.resolved, startupProblem: '' };
}

const STARTUP_MODE = resolveStartupMode();
const isLocalMode = STARTUP_MODE.storageMode === 'local';

const vaultEngine = new VaultEngine({
  userDataDir: app.getPath('userData'),
  appRootDir: appRoot(),
  defaultVaultDir: DEFAULT_VAULT_DIR,
  deviceIdPrefix: 'pc',
  autoIndexRefresh: true,
  localVaultRoot: STARTUP_MODE.localVaultDir,
});

const relayAgent = new RelayAgent({
  userDataDir: app.getPath('userData'),
  vaultEngine,
  aiCliRunner,
  isLocalMode,
  getKinakoRelayDir: () => resolveKinakoRelayDir(),
});

const mcpHost = new ThinktankMcpHost({
  vaultEngine,
  isThinkDirty: async (thinkid) => {
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (win.isDestroyed()) continue;
      try {
        const dirty = await win.webContents.executeJavaScript(
          `Boolean(window.__ttIsThinkDirty && window.__ttIsThinkDirty(${JSON.stringify(String(thinkid))}))`,
        );
        if (dirty) return true;
      } catch {
        // ignore renderer probe failure
      }
    }
    return false;
  },
  onRecordMutated: async (event) => {
    const record = event.thinkid ? vaultEngine.getRecord(event.thinkid) : null;
    const projectRecord =
      event.projectId && event.projectId !== event.thinkid
        ? vaultEngine.getRecord(event.projectId)
        : null;
    const payload = {
      ...event,
      record,
      projectRecord,
    };
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('vault:mcp-mutated', payload);
      }
    }
  },
});

aiCliRunner.setDefaultMcpHost(mcpHost);
relayAgent.setMcpHost(mcpHost);

// きなこ向け MCP HTTP 入口（設定で有効にした場合だけ待ち受ける。ローカル運用モードでは起動しない）
const mcpHttpServer = new McpHttpServer({
  userDataDir: app.getPath('userData'),
  mcpHost,
  getDeviceId: () => vaultEngine.config.deviceId,
  isLocalMode,
});

// ── IPC ハンドラー（Storage / Vault v1） ────────────────────────────────────

ipcMain.handle('storage:listMeta', () => {
  return vaultEngine.listMeta();
});

ipcMain.handle('storage:getContent', (_event, id) => {
  return vaultEngine.getContent(id);
});

ipcMain.handle('storage:getRecord', (_event, id) => {
  return vaultEngine.getRecord(id);
});

ipcMain.handle('storage:save', (_event, payload) => {
  return perfTime('storage:save', () => vaultEngine.saveRecordAsync(payload));
});

ipcMain.handle('storage:writeBackup', (_event, payload) => {
  return perfTime('storage:writeBackup', () => vaultEngine.saveBackupSnapshotAsync(payload));
});

ipcMain.handle('storage:saveSupport', (_event, id, metadata, expectedVersion) => {
  return vaultEngine.saveSupportMetadata(id, metadata, expectedVersion);
});

ipcMain.handle('storage:delete', (_event, id) => {
  return vaultEngine.deleteRecord(id);
});

ipcMain.handle('storage:search', (_event, query) => {
  return vaultEngine.search(query || '');
});

// ── IPC ハンドラー（Vault 設定・衝突検知・シャード索引） ──────────────────

ipcMain.handle('vault:getConfig', () => {
  return vaultEngine.getConfig();
});

ipcMain.handle('vault:setConfig', (_event, partial) => {
  return vaultEngine.saveConfig(partial || {});
});

ipcMain.handle('vault:selectFolder', async () => {
  const wins = BrowserWindow.getAllWindows();
  const res = await dialog.showOpenDialog(wins[0] || undefined, {
    title: 'Vault フォルダ（Google Drive の Thinktank フォルダ等）を選択',
    defaultPath: vaultEngine.getVaultRootDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return null;
  }
  const selected = res.filePaths[0];
  return vaultEngine.saveConfig({ vaultDir: selected });
});

// ── IPC ハンドラー（運用モード: Firestore / ローカル） ──────────────────────

function backupVaultRoot() {
  return appMode.resolveBackupVaultRoot(app.getPath('userData'), DEFAULT_VAULT_DIR);
}

ipcMain.handle('appMode:get', () => ({
  running: { storageMode: STARTUP_MODE.storageMode, localVaultDir: STARTUP_MODE.localVaultDir },
  saved: appMode.loadAppMode(app.getPath('userData')),
  backupVaultRoot: backupVaultRoot(),
  startupProblem: STARTUP_MODE.startupProblem,
}));

ipcMain.handle('appMode:selectFolder', async (_event, currentDir) => {
  const wins = BrowserWindow.getAllWindows();
  const res = await dialog.showOpenDialog(wins[0] || undefined, {
    title: 'ThinkファイルFolder を選択',
    defaultPath: typeof currentDir === 'string' && currentDir ? currentDir : app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled || !res.filePaths?.length ? null : res.filePaths[0];
});

// 保存して再起動する。未保存の編集は画面側で先に保存してから呼ぶ
ipcMain.handle('appMode:apply', (_event, next) => {
  const storageMode = next && next.storageMode === 'local' ? 'local' : 'firestore';
  const localVaultDir = next && typeof next.localVaultDir === 'string' ? next.localVaultDir.trim() : '';
  let savedDir = localVaultDir;
  if (storageMode === 'local') {
    const verdict = appMode.validateLocalVaultDir(localVaultDir, backupVaultRoot());
    if (!verdict.ok) return { ok: false, error: verdict.error };
    try {
      appMode.prepareLocalVaultDir(verdict.resolved);
    } catch (err) {
      return { ok: false, error: `ThinkファイルFolder を作成できませんでした: ${err.message || err}` };
    }
    savedDir = verdict.resolved;
  }
  appMode.saveAppMode(app.getPath('userData'), { storageMode, localVaultDir: savedDir });
  setImmediate(() => {
    const devRestartCode = Number(process.env.TT_DEV_RESTART_EXIT_CODE);
    if (devRestartCode) {
      // scripts/dev-electron.mjs が起動し直す。relaunch すると Vite が止まり画面を読めなくなる
      app.once('will-quit', () => app.exit(devRestartCode));
    } else {
      app.relaunch();
    }
    app.quit();
  });
  return { ok: true };
});

// ── IPC ハンドラー（ローカル運用のスナップショット） ───────────────────────

ipcMain.handle('snapshot:create', (_event, id) => vaultEngine.createSnapshot(id));
ipcMain.handle('snapshot:get', (_event, id) => vaultEngine.getSnapshot(id));
ipcMain.handle('snapshot:list', (_event, id) => vaultEngine.listSnapshots(id));
ipcMain.handle('snapshot:delete', (_event, id) => vaultEngine.deleteSnapshot(id));

// ── IPC ハンドラー（Firestore ⇔ ThinkファイルFolder の移行） ─────────────────
// Firestore モードで実行する。ThinkファイルFolder は今の正本ではないので別のエンジンで開く。

const migrationEngines = new Map();
function migrationEngine(dir) {
  if (isLocalMode) throw new Error('移行は「Firestore で使う」モードで実行してください。');
  const verdict = appMode.validateLocalVaultDir(dir, backupVaultRoot());
  if (!verdict.ok) throw new Error(verdict.error);
  appMode.prepareLocalVaultDir(verdict.resolved);
  const key = verdict.resolved.toLowerCase();
  if (!migrationEngines.has(key)) {
    migrationEngines.set(key, new VaultEngine({
      userDataDir: app.getPath('userData'),
      appRootDir: appRoot(),
      defaultVaultDir: DEFAULT_VAULT_DIR,
      deviceIdPrefix: 'pc',
      autoIndexRefresh: false,
      localVaultRoot: verdict.resolved,
    }));
  }
  return migrationEngines.get(key);
}

ipcMain.handle('localVault:listMeta', (_event, dir) => migrationEngine(dir).listMeta());
ipcMain.handle('localVault:getRecord', (_event, dir, id) => migrationEngine(dir).getRecord(id));
ipcMain.handle('localVault:importNewer', (_event, dir, payload) => migrationEngine(dir).importNewerRecord(payload));
ipcMain.handle('localVault:stashVersion', (_event, dir, record, reason) => {
  migrationEngine(dir).stashExternalVersion(record, reason === 'firestore-overwritten' ? reason : 'firestore');
  return true;
});

// ── IPC ハンドラー（ドメインプロファイル切替 .thinktank/prompts/） ─────────

ipcMain.handle('profile:getActive', () => {
  return vaultEngine.getActiveDomainProfile();
});

ipcMain.handle('profile:listAvailable', () => {
  return Object.values(shared.BUILTIN_DOMAIN_PROFILES).map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: p.subtitle,
    description: p.description,
  }));
});

ipcMain.handle('profile:setActive', (_event, profileId) => {
  return vaultEngine.setActiveDomainProfile(profileId);
});

// ── IPC ハンドラー（ローカル AI CLI 設定隔離実行） ────────────────────────

ipcMain.handle('ai:getStatus', () => {
  const clis = aiCliRunner.detectAvailableClis();
  return {
    availableClis: clis,
    preferredCli: vaultEngine.config.preferredCli || 'claude',
    preferredModel: vaultEngine.config.preferredModel || '',
    activeProfileId: vaultEngine.getActiveDomainProfile().id,
  };
});

ipcMain.handle('ai:getAuthStatus', () => aiCliRunner.detectAiAuthentication());

ipcMain.handle('ai:login', (_event, provider) => aiCliRunner.startAiAuthentication(provider, {
  onClose: () => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ai:auth-changed', { provider });
      }
    }
  },
}));

ipcMain.handle('ai:getGnbNotebookTitle', (_event, notebookId) => (
  aiCliRunner.getGeminiNotebookTitle({ notebookId })
));

ipcMain.handle('ai:conversation', async (_event, params) => {
  if (params?.provider === 'gnb') {
    return aiCliRunner.runGeminiNotebookConversation({
      notebookId: params?.model,
      userMessage: params?.userMessage,
      timeoutMs: params?.timeoutMs,
    });
  }

  const profile = params?.profileId
    ? vaultEngine.getDomainProfileById(params.profileId)
    : vaultEngine.getActiveDomainProfile();

  return aiCliRunner.runDomainAiConversation({
    ...params,
    cliName: params?.cliName || vaultEngine.config.preferredCli || 'claude',
    model: params?.model || vaultEngine.config.preferredModel || undefined,
    profile,
  });
});

// 画面の「中断」。実行中（または順番待ち中）の AI CLI を止める
ipcMain.handle('ai:cancel', (_event, requestId) => aiCliRunner.cancelCliRun(requestId));

ipcMain.handle('ai:agent', async (_event, params) => {
  const profile = params?.profileId
    ? vaultEngine.getDomainProfileById(params.profileId)
    : vaultEngine.getActiveDomainProfile();

  return aiCliRunner.runDomainAiConversation({
    ...params,
    cliName: params?.cliName || vaultEngine.config.preferredCli || 'claude',
    model: params?.model || vaultEngine.config.preferredModel || undefined,
    profile,
  });
});

// ── IPC ハンドラー（MCP HTTP 入口） ─────────────────────────────────────────

ipcMain.handle('mcpHttp:getStatus', () => mcpHttpServer.getStatus());
ipcMain.handle('mcpHttp:setEnabled', (_event, enabled) => mcpHttpServer.setEnabled(Boolean(enabled)));
ipcMain.handle('mcpHttp:configure', (_event, partial) => mcpHttpServer.configure(partial || {}));
ipcMain.handle('mcpHttp:createToken', (_event, options) => mcpHttpServer.createToken(options || {}));
ipcMain.handle('mcpHttp:reissueToken', (_event, options) => mcpHttpServer.reissueToken(options || {}));
ipcMain.handle('mcpHttp:revokeToken', (_event, id) => mcpHttpServer.revokeToken(String(id || '')));

// ── IPC ハンドラー（中継役PC RelayAgent） ──────────────────────────────────

ipcMain.handle('relay:getStatus', () => {
  return relayAgent.getStatus();
});

// OSブラウザで得たFirebaseセッションを、Think正本へ接続するrendererにも共有する。
// contextBridge越しの同一アプリ内IPCに限定し、Webコンテンツへは公開しない。
ipcMain.handle('relay:getFirebaseSession', () => {
  return relayAgent.getFirebaseSession();
});

ipcMain.handle('relay:configure', (_event, partial) => {
  return relayAgent.saveConfig(partial || {});
});

ipcMain.handle('relay:rotateSecret', () => {
  return relayAgent.rotatePairingSecret();
});

// 画面側の Firebase ログインはメインプロセスの中継役に届かないため、refresh token をここで受け渡す
ipcMain.handle('relay:setFirebaseSession', async (_event, session) => {
  const { refreshToken, email, apiKey } = session || {};
  if (typeof refreshToken !== 'string' || !refreshToken) {
    throw new Error('Firebase の refresh token がありません。');
  }
  return relayAgent.setFirebaseRefreshToken(
    refreshToken,
    typeof email === 'string' ? email : '',
    typeof apiKey === 'string' ? apiKey : '',
  );
});

ipcMain.handle('relay:signOutFirebase', () => {
  return relayAgent.signOutFirebase();
});

// きなこ専用アカウントのパスワードはここで使い切る（保存するのはリフレッシュトークンだけ）
ipcMain.handle('relay:setKinakoPassword', async (_event, password) => {
  return relayAgent.setKinakoPassword(typeof password === 'string' ? password : '');
});

ipcMain.handle('relay:getKinakoAuthStatus', () => {
  return relayAgent.getKinakoAuthStatus();
});

ipcMain.handle('relay:signOutKinako', () => {
  return relayAgent.signOutKinako();
});

// 製品版の画面（app://）は Google の戻り先に登録できないため、いつものブラウザでログインしてもらう
let googleSignInRunning = null;
ipcMain.handle('relay:signInWithGoogle', async (_event, options) => {
  if (googleSignInRunning) throw new Error('ブラウザでのログインがすでに進行中です。ブラウザの画面を確認してください。');
  const client = loadDesktopClient([
    path.join(app.getPath('userData'), GOOGLE_DESKTOP_CLIENT_FILE),
    path.join(__dirname, GOOGLE_DESKTOP_CLIENT_FILE),
  ]);
  if (!client) {
    throw new Error(
      `デスクトップ用の OAuth クライアントが設定されていません。Google Cloud コンソールで「デスクトップ アプリ」の OAuth クライアントを作り、` +
      `ダウンロードした JSON を ${path.join(app.getPath('userData'), GOOGLE_DESKTOP_CLIENT_FILE)} に置いてください。`,
    );
  }
  googleSignInRunning = (async () => {
    const { accessToken } = await signInWithGoogleLoopback({
      ...client,
      openExternal: (url) => shell.openExternal(url),
    });
    const apiKey = (options && typeof options.apiKey === 'string' && options.apiKey) || relayAgent.firebaseApiKey;
    if (!apiKey) throw new Error('Firebase の API キー（VITE_FIREBASE_API_KEY）が見つかりません。');
    if (options && typeof options.firebaseProjectId === 'string' && options.firebaseProjectId) {
      relayAgent.saveConfig({ firebaseProjectId: options.firebaseProjectId });
    }
    const session = await shared.signInWithGoogleAccessToken(apiKey, accessToken, 'http://localhost');
    return relayAgent.setFirebaseRefreshToken(session.refreshToken, session.email, apiKey);
  })();
  try {
    return await googleSignInRunning;
  } finally {
    googleSignInRunning = null;
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  }
});

ipcMain.handle('relay:handleEncrypted', async (_event, payload) => {
  return relayAgent.handleEncryptedRequest(payload);
});

// ── IPC ハンドラー（OS の既定アプリでローカルファイルを開く） ───────────────

ipcMain.handle('system:openPath', async (_event, target) => {
  const verdict = validateOpenPath(target);
  if (!verdict.ok) {
    console.warn(`[main] Blocked openPath (${verdict.reason}): ${target}`);
    return { ok: false, error: verdict.reason };
  }
  // shell.openPath は失敗時に理由の文字列、成功時に空文字を返す
  const error = await shell.openPath(verdict.resolved);
  return error ? { ok: false, error } : { ok: true };
});

// linkファイルの [file:ID] / [dir:ID] を決めるため、存在とフォルダかどうかだけを返す（中身は読まない）
ipcMain.handle('system:isDirectory', async (_event, target) => {
  if (typeof target !== 'string' || !target.trim() || target.includes('\0') || !path.isAbsolute(target.trim())) {
    return { ok: false, error: 'path must be absolute' };
  }
  try {
    const stat = await fs.promises.stat(target.trim());
    return { ok: true, isDirectory: stat.isDirectory() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Windows の .lnk は renderer の File API ではリンク先を読めないため、Electron の
// shell.readShortcutLink() だけを限定公開する。任意ファイル読取にしないよう .lnk のみ許可する。
ipcMain.handle('system:readShortcutLink', async (_event, target) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows shortcut is not supported on this OS' };
  const verdict = validateShortcutPath(target);
  if (!verdict.ok) return { ok: false, error: verdict.reason };
  try {
    const detail = shell.readShortcutLink(verdict.resolved);
    return detail.target ? { ok: true, target: detail.target } : { ok: false, error: 'shortcut target is empty' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// ── カスタムプロトコル app://thinktank/ ハンドラ登録 ─────────────────────────

function registerAppProtocol() {
  const distDir = path.join(appRoot(), 'dist');
  protocol.handle('app', (request) => {
    const urlObj = new URL(request.url);
    let relPath = decodeURIComponent(urlObj.pathname || '/');
    if (relPath === '/' || relPath === '') {
      relPath = '/index.html';
    }
    const safeRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    let targetPath = path.join(distDir, safeRel);
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(distDir, 'index.html');
    }
    return electronNet.fetch(pathToFileURL(targetPath).toString());
  });
}

// ── CSP ────────────────────────────────────────────────────────────────────

function installCsp() {
  const csp = isDev
    ? "default-src 'self' app: 'unsafe-inline' 'unsafe-eval' http://localhost:*; " +
      "connect-src 'self' app: ws://localhost:* http://localhost:* https://*.googleapis.com https://*.firebaseio.com https://script.google.com https://script.googleusercontent.com; " +
      "img-src 'self' app: data: blob:; worker-src 'self' app: blob:; " +
      "object-src 'none'; base-uri 'none';"
    : "default-src 'self' app:; script-src 'self' app: 'unsafe-eval'; style-src 'self' app: 'unsafe-inline'; " +
      "img-src 'self' app: data: blob:; font-src 'self' app: data:; connect-src 'self' app: https://*.googleapis.com https://*.firebaseio.com https://script.google.com https://script.googleusercontent.com; " +
      "worker-src 'self' app: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none';";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
}

// ── ウィンドウ作成 ──────────────────────────────────────────────────────────

function createWindow(startUrl) {
  const win = new BrowserWindow({
    width:  1400,
    height: 900,
    // 画面の読み込み中に白く光らないよう、index.html の背景色と揃える
    backgroundColor: '#1e2030',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      // 画面は起動直後に保存先を決めるので、IPC の往復を待たずに preload から読めるよう渡す
      additionalArguments: [
        `--tt-storage-mode=${STARTUP_MODE.storageMode}`,
        ...(perfEnabled ? ['--tt-perf=1'] : []),
      ],
    },
  });

  win.webContents.on('console-message', (...args) => {
    const e = args[0];
    const isNewApi = e && typeof e === 'object' && 'level' in e && typeof e.level === 'string';
    const level   = isNewApi ? e.level : args[1];
    const message = isNewApi ? e.message : args[2];
    const severe  = isNewApi ? (level === 'warning' || level === 'error') : level >= 2;
    if (severe) console.log(`[renderer:${level}] ${message}`);
    else if (perfEnabled && String(message).startsWith('[Perf]')) console.error(message);
  });

  // 地図・検索タグなどの外部ページは既定ブラウザで開く。Google ログインのポップアップだけは
  // 開いた画面へ結果を返す必要があるのでアプリ内に残す
  win.webContents.setWindowOpenHandler(({ url }) => {
    let parsed;
    try { parsed = new URL(url); } catch { return { action: 'deny' }; }
    if (parsed.hostname === 'accounts.google.com') return { action: 'allow' };
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      shell.openExternal(url).catch((err) => console.error('[main] 外部ブラウザで開けませんでした:', err));
    }
    return { action: 'deny' };
  });

  win.webContents.once('did-finish-load', () => perfMark('did-finish-load'));

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] 画面の読み込みに失敗: ${desc} (${code}) ${url}`);
  });

  let forceClose = false;
  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    (async () => {
      let dirty = false;
      try {
        dirty = await win.webContents.executeJavaScript(
          '!!(window.__ttHasUnsavedChanges && window.__ttHasUnsavedChanges())'
        );
      } catch (err) {
        console.error('[main] 未保存チェックに失敗:', err);
      }
      if (!dirty) { forceClose = true; win.close(); return; }

      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['保存して終了', '保存せず終了', 'キャンセル'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        message: '未保存の変更があります',
        detail: 'エディタに保存されていない変更があります。',
      });
      if (response === 2) return;
      if (response === 0) {
        try {
          await win.webContents.executeJavaScript(
            '(window.__ttFlushAllSaves ? window.__ttFlushAllSaves() : null)', true
          );
        } catch (err) {
          console.error('[main] 保存フラッシュに失敗:', err);
        }
      }
      forceClose = true;
      win.close();
    })();
  });

  if (process.env.TT_SELFTEST === '1') {
    console.log('[selftest] 有効');
    win.webContents.once('did-finish-load', async () => {
      const probe = `(async () => {
        const api = window.electronAPI;
        const csp = await fetch(location.href).then(r => r.headers.get('content-security-policy')).catch(() => null);
        let evalBlocked = null;
        try { (0, eval)('1+1'); evalBlocked = false; } catch { evalBlocked = true; }

        let ipcMetaCount = null, ipcError = null, contentLen = null;
        try {
          const metas = await api.storage.listMeta();
          ipcMetaCount = Array.isArray(metas) ? metas.length : typeof metas;
          if (Array.isArray(metas) && metas.length) {
            const c = await api.storage.getContent(metas[0].thinkid);
            contentLen = c === null ? null : c.length;
          }
        } catch (e) { ipcError = String(e && e.message || e); }
        const openPathRejectsRelative = api.system
          ? (await api.system.openPath('relative.txt')).ok === false
          : null;

        await new Promise(r => setTimeout(r, 2500));
        const renderedTitles = document.querySelectorAll('.thoughts-list__title').length;

        return JSON.stringify({
          hasElectronAPI: !!api, storageMode: api.appMode ? api.appMode.storageMode : null, evalBlocked, ipcMetaCount, ipcError, contentLen,
          openPathRejectsRelative, renderedTitles, origin: location.origin,
          csp: csp ? csp.slice(0, 45) + '...' : null
        });
      })()`;
      try {
        console.log('[selftest]', await win.webContents.executeJavaScript(probe));
      } catch (e) {
        console.log('[selftest] failed:', e.message);
      }
    });
  }

  win.loadURL(startUrl);
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

// ── アプリ起動 ─────────────────────────────────────────────────────────────

const SEARCH_WARM_UP_DELAY_MS = 20_000;
let searchWarmUpTimer = null;

app.whenReady()
  .then(() => {
    perfMark('ready');
    registerAppProtocol();
    const vDir = vaultEngine.getVaultDir();
    console.log(`[Vault] mode=${STARTUP_MODE.storageMode} userData=${app.getPath('userData')} dir=${vDir}`);
    installCsp();

    const startUrl = isDev ? 'http://localhost:5173' : 'app://thinktank/index.html';

    createWindow(startUrl);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
    });
    if (STARTUP_MODE.startupProblem) {
      void dialog.showMessageBox({
        type: 'warning',
        message: 'ローカル運用モードで起動できませんでした',
        detail: `${STARTUP_MODE.startupProblem}\n\n今回は「Firestore で使う」モードで起動します。設定 > モード切替 で ThinkファイルFolder を確認してください。`,
      });
    }
    // ローカル運用では Firebase に接続しない
    if (!isLocalMode) relayAgent.start();
    void mcpHttpServer.start();
    // 前回の終了後に G: で変わったファイルも Web 版の索引に載るよう、起動後に一度作り直す
    vaultEngine.scheduleIndexRefresh({ shardDelayMs: 30_000, bodyPackDelayMs: 10 * 60_000 });
    // 一覧の同期読み込みと本文パックの解析で止まるので、画面の読み込みと競合させない。
    // 待つ間に検索が来ても search() が自分で本文を読む。
    searchWarmUpTimer = setTimeout(() => {
      vaultEngine.warmUpSearch().catch((err) => console.warn(`[Vault] 検索の準備に失敗しました: ${err.message || err}`));
    }, SEARCH_WARM_UP_DELAY_MS);
  })
  .catch(err => {
    console.error('[main] 起動に失敗しました:', err);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  clearTimeout(searchWarmUpTimer);
  relayAgent.stop();
  void mcpHttpServer.stop();
  vaultEngine.stopIndexRefresh();
});
