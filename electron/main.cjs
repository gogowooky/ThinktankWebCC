'use strict';

const { app, BrowserWindow, ipcMain, session, dialog, protocol, shell, net: electronNet } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { pathToFileURL } = require('url');
const { validateOpenPath } = require('./openPath.cjs');
const { VaultEngine } = require('./vaultEngine.cjs');
const aiCliRunner = require('./aiCliRunner.cjs');
const { RelayAgent } = require('./relayAgent.cjs');
const { ThinktankMcpHost } = require('./mcpBridge.cjs');
const { loadDesktopClient, signInWithGoogleLoopback } = require('./googleLoopbackAuth.cjs');

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

const vaultEngine = new VaultEngine({
  userDataDir: app.getPath('userData'),
  appRootDir: appRoot(),
  defaultVaultDir: DEFAULT_VAULT_DIR,
  deviceIdPrefix: 'pc',
  autoIndexRefresh: true,
});

const relayAgent = new RelayAgent({
  userDataDir: app.getPath('userData'),
  vaultEngine,
  aiCliRunner,
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

ipcMain.handle('storage:getSupport', (_event, id) => {
  const rec = vaultEngine.getRecord(id);
  return rec ? rec.support : null;
});

ipcMain.handle('storage:save', (_event, payload) => {
  return vaultEngine.saveRecord(payload);
});

ipcMain.handle('storage:writeBackup', (_event, payload) => {
  return vaultEngine.saveBackupSnapshot(payload);
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

ipcMain.handle('vault:listConflicts', () => {
  return vaultEngine.listConflictFiles();
});

ipcMain.handle('vault:writeShard', () => {
  return vaultEngine.writeDeviceShard();
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

ipcMain.handle('profile:saveCustom', (_event, profileObj) => {
  return vaultEngine.saveCustomDomainProfile(profileObj);
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

ipcMain.handle('ai:conversation', async (_event, params) => {
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

ipcMain.handle('relay:executePlain', async (_event, envelope) => {
  return relayAgent.executePlainRequest(envelope);
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
      "connect-src 'self' app: ws://localhost:* http://localhost:* https://*.googleapis.com https://*.firebaseio.com; " +
      "img-src 'self' app: data: blob:; worker-src 'self' app: blob:; " +
      "object-src 'none'; base-uri 'none';"
    : "default-src 'self' app:; script-src 'self' app: 'unsafe-eval'; style-src 'self' app: 'unsafe-inline'; " +
      "img-src 'self' app: data: blob:; font-src 'self' app: data:; connect-src 'self' app: https://*.googleapis.com https://*.firebaseio.com; " +
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
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  win.webContents.on('console-message', (...args) => {
    const e = args[0];
    const isNewApi = e && typeof e === 'object' && 'level' in e && typeof e.level === 'string';
    const level   = isNewApi ? e.level : args[1];
    const message = isNewApi ? e.message : args[2];
    const severe  = isNewApi ? (level === 'warning' || level === 'error') : level >= 2;
    if (severe) console.log(`[renderer:${level}] ${message}`);
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
          hasElectronAPI: !!api, evalBlocked, ipcMetaCount, ipcError, contentLen,
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

app.whenReady()
  .then(() => {
    registerAppProtocol();
    const vDir = vaultEngine.getVaultDir();
    console.log(`[Vault] userData=${app.getPath('userData')} dir=${vDir}`);
    installCsp();

    const startUrl = isDev ? 'http://localhost:5173' : 'app://thinktank/index.html';

    createWindow(startUrl);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
    });
    relayAgent.start();
    // 前回の終了後に G: で変わったファイルも Web 版の索引に載るよう、起動後に一度作り直す
    vaultEngine.scheduleIndexRefresh({ shardDelayMs: 30_000, bodyPackDelayMs: 10 * 60_000 });
    vaultEngine.warmUpSearch().catch((err) => console.warn(`[Vault] 検索の準備に失敗しました: ${err.message || err}`));
  })
  .catch(err => {
    console.error('[main] 起動に失敗しました:', err);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  relayAgent.stop();
  vaultEngine.stopIndexRefresh();
});
