'use strict';

const { app, BrowserWindow, ipcMain, session, dialog, protocol, net: electronNet } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { syncVaultFromServer } = require('./vaultSync.cjs');
const { spawn } = require('child_process');
const { VaultEngine } = require('./vaultEngine.cjs');
const aiCliRunner = require('./aiCliRunner.cjs');
const { RelayAgent } = require('./relayAgent.cjs');
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
 * では <repo>/electron を返し、リポジトリ直下にならないため server/.env や
 * dist-server を取り違える。
 */
function appRoot() {
  return path.join(__dirname, '..');
}

const DEFAULT_VAULT_DIR = path.join(app.getPath('userData'), 'thinktank', 'vault_ver2');

const vaultEngine = new VaultEngine({
  userDataDir: app.getPath('userData'),
  appRootDir: appRoot(),
  defaultVaultDir: DEFAULT_VAULT_DIR,
});

const relayAgent = new RelayAgent({
  userDataDir: app.getPath('userData'),
  vaultEngine,
  aiCliRunner,
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

ipcMain.handle('storage:getSupport', (_event, id) => {
  const rec = vaultEngine.getRecord(id);
  return rec ? rec.support : null;
});

ipcMain.handle('storage:save', (_event, payload) => {
  return vaultEngine.saveRecord(payload);
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

ipcMain.handle('relay:configure', (_event, partial) => {
  return relayAgent.saveConfig(partial || {});
});

ipcMain.handle('relay:rotateSecret', () => {
  return relayAgent.rotatePairingSecret();
});

ipcMain.handle('relay:executePlain', async (_event, envelope) => {
  return relayAgent.executePlainRequest(envelope);
});

ipcMain.handle('relay:handleEncrypted', async (_event, payload) => {
  return relayAgent.handleEncryptedRequest(payload);
});

// ── BigQuery 同期（後方互換・移行期サポート） ───────────────────────────────

function getSyncTarget(explicitUrl) {
  if (!explicitUrl && serverOrigin) {
    return { base: serverOrigin, apiKey: serverApiKey };
  }
  const base = (explicitUrl || 'http://127.0.0.1:8080').replace(/\/$/, '');
  return { base, apiKey: serverApiKey || loadServerEnv().API_SHARED_SECRET };
}

async function fetchJson(url, apiKey) {
  const res = await fetch(url, { headers: apiKey ? { 'X-Thinktank-Api-Key': apiKey } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

ipcMain.handle('storage:syncFromServer', async (_event, serverUrl) => {
  const vDir = vaultEngine.getVaultDir();
  const { base, apiKey } = getSyncTarget(serverUrl);
  const authHeaders = apiKey ? { 'X-Thinktank-Api-Key': apiKey } : {};
  const serverMetas = await fetchJson(`${base}/api/bq/files/meta`, apiKey);
  return syncVaultFromServer(vDir, serverMetas, async meta => {
    const res = await fetch(`${base}/api/bq/files/${encodeURIComponent(meta.thinkid)}/content`, { headers: authHeaders });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}: content ${meta.thinkid}`);
    return res.status === 404 ? '' : res.json();
  });
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

// ── ローカルサーバー管理（パッケージ版・後方互換用） ─────────────────────────

let serverProcess = null;
let serverApiKey  = null;
let serverOrigin  = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function resolveServerEntry() {
  return path.join(appRoot(), 'dist-server', 'index.js');
}

function loadServerEnv() {
  const candidates = [
    path.join(app.getPath('userData'), 'server.env'),
    path.join(appRoot(), 'server', '.env'),
  ];

  const env = {};
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    console.log(`[main] server env loaded from ${file}`);
    break;
  }

  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && !env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      env.GOOGLE_SERVICE_ACCOUNT_KEY = fs.readFileSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf8');
    } catch (e) {
      console.error(`[main] service account key の読み込みに失敗: ${e.message}`);
    }
  }
  return env;
}

async function waitForHealth(origin, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!serverProcess) throw new Error('ローカルサーバーが起動直後に終了しました');
    try {
      const res = await fetch(`${origin}/api/health`);
      if (res.ok) return;
    } catch { /* 起動待ち */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('ローカルサーバーが応答しませんでした');
}

async function startLocalServer() {
  const entry = resolveServerEntry();
  if (!fs.existsSync(entry)) {
    // dist-server が存在しない場合はカスタムプロトコル app://thinktank/ にフォールバック
    console.log('[main] dist-server なし -> app://thinktank/index.html で直接配信します');
    return 'app://thinktank/index.html';
  }

  const port = await findFreePort();
  serverApiKey = crypto.randomBytes(32).toString('hex');

  const env = {
    ...process.env,
    ...loadServerEnv(),
    ELECTRON_RUN_AS_NODE: '1',
    PORT:                 String(port),
    API_SHARED_SECRET:    serverApiKey,
  };
  delete env.K_SERVICE;

  serverProcess = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  serverProcess.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', d => process.stderr.write(`[server] ${d}`));
  serverProcess.on('exit', (code, signal) => {
    console.error(`[main] ローカルサーバーが終了しました (code=${code}, signal=${signal})`);
    serverProcess = null;
  });

  const origin = `http://127.0.0.1:${port}`;
  await waitForHealth(origin);
  serverOrigin = origin;
  console.log(`[main] ローカルサーバー起動: ${origin}`);
  return origin;
}

function stopLocalServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;
  proc.kill();
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
      additionalArguments: serverApiKey ? [`--tt-api-key=${serverApiKey}`] : [],
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
        const cfg = api && api.apiConfig;
        const hasKey = !!(cfg && cfg.apiKey);
        const withKey = await fetch('/api/bq/files/meta', {
          headers: cfg && cfg.apiKey ? { 'X-Thinktank-Api-Key': cfg.apiKey } : {},
        }).then(r => r.status).catch(e => 'ERR ' + e.message);
        const without = await fetch('/api/bq/files/meta').then(r => r.status).catch(e => 'ERR ' + e.message);
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

        await new Promise(r => setTimeout(r, 2500));
        const renderedTitles = document.querySelectorAll('.thoughts-list__title').length;

        return JSON.stringify({
          hasElectronAPI: !!api, hasKey, withKey, without, evalBlocked,
          ipcMetaCount, ipcError, contentLen, renderedTitles,
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
  .then(async () => {
    registerAppProtocol();
    const vDir = vaultEngine.getVaultDir();
    console.log(`[Vault] userData=${app.getPath('userData')}`);
    console.log(`[Vault] dir=${vDir} files=${fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(f => f.endsWith('.md')).length : 0}`);
    installCsp();

    const startUrl = isDev
      ? 'http://localhost:5173'
      : process.env.TT_USE_APP_PROTOCOL === '1'
        ? 'app://thinktank/index.html'
        : await startLocalServer();

    if (process.env.TT_SELFTEST === '1') {
      const t = getSyncTarget();
      let status = 'n/a';
      try {
        const r = await fetch(`${t.base}/api/bq/files/meta`, {
          headers: t.apiKey ? { 'X-Thinktank-Api-Key': t.apiKey } : {},
        });
        status = `HTTP ${r.status}` + (r.ok ? ` / ${(await r.json()).length}件` : '');
      } catch (e) { status = 'ERR ' + e.message; }
      console.log(`[selftest] syncTarget base=${t.base} hasKey=${!!t.apiKey} -> ${status}`);
    }

    createWindow(startUrl);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
    });
  })
  .catch(err => {
    console.error('[main] 起動に失敗しました:', err);
    stopLocalServer();
    app.quit();
  });

app.on('before-quit',        stopLocalServer);
app.on('will-quit',          stopLocalServer);
app.on('window-all-closed', () => {
  stopLocalServer();
  if (process.platform !== 'darwin') app.quit();
});
