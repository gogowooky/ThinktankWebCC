'use strict';

const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { VaultEngine } = require('./vaultEngine.cjs');
const aiCliRunner = require('./aiCliRunner.cjs');
const { RelayAgent } = require('./relayAgent.cjs');
const { resolveKinakoRelayDir } = require('./kinakoTokenRelay.cjs');
const { McpHttpServer } = require('./mcpHttpServer.cjs');
const { ThinktankMcpHost } = require('./mcpBridge.cjs');
const appMode = require('./appMode.cjs');
const { registerIpcHandlers } = require('./ipc/index.cjs');
const { registerAppProtocol, installCsp } = require('./appProtocol.cjs');
const { createWindow } = require('./mainWindow.cjs');
const { perfMark } = require('./perfLog.cjs');

perfMark('modules-loaded');

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

// ── IPC ハンドラー（窓口の種類ごとに electron/ipc/*.cjs） ────────────────────

registerIpcHandlers(ipcMain, {
  app, BrowserWindow, dialog, shell,
  vaultEngine, relayAgent, mcpHttpServer, aiCliRunner,
  STARTUP_MODE, isLocalMode, DEFAULT_VAULT_DIR, appRoot,
});

// ── アプリ起動 ─────────────────────────────────────────────────────────────

const SEARCH_WARM_UP_DELAY_MS = 20_000;
let searchWarmUpTimer = null;

app.whenReady()
  .then(() => {
    perfMark('ready');
    registerAppProtocol(appRoot);
    const vDir = vaultEngine.getVaultDir();
    console.log(`[Vault] mode=${STARTUP_MODE.storageMode} userData=${app.getPath('userData')} dir=${vDir}`);
    installCsp(isDev);

    const startUrl = isDev ? 'http://localhost:5173' : 'app://thinktank/index.html';

    createWindow(startUrl, { isDev, STARTUP_MODE });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl, { isDev, STARTUP_MODE });
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