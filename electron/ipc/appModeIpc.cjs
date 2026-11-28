'use strict';

/**
 * electron/ipc/appModeIpc.cjs
 * appMode:*（運用モードの切替）、snapshot:*、localVault:*（Firestore ⇔ ThinkファイルFolder の移行）、
 * overwriteImport:*（上書きコピー）の IPC。
 *
 * electron 本体は require せず、main.cjs が作ったものを ctx で受け取る（テストから読み込めるようにするため）。
 */

const appMode = require('../appMode.cjs');
const overwriteImport = require('../overwriteImport.cjs');
const { VaultEngine } = require('../vaultEngine.cjs');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./index.cjs').IpcContext} ctx
 */
function register(ipcMain, ctx) {
  const { app, BrowserWindow, dialog, vaultEngine, STARTUP_MODE, isLocalMode, DEFAULT_VAULT_DIR, appRoot } = ctx;

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

  ipcMain.handle('appMode:selectFolder', async (_event, currentDir, title) => {
    const wins = BrowserWindow.getAllWindows();
    const res = await dialog.showOpenDialog(wins[0] || undefined, {
      title: typeof title === 'string' && title ? title : 'ThinkファイルFolder を選択',
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

  // ── IPC ハンドラー（上書き用Thinkファイルフォルダー → Firestore の上書きコピー） ──
  // 読むだけで、指定フォルダには書かない。上書きされる Firestore の版は Markdownバックアップ先の trash/ に残す。

  function requireFirestoreModeForOverwrite() {
    if (isLocalMode) throw new Error('上書きコピーは「Firestore で使う」モードで実行してください。');
  }

  ipcMain.handle('overwriteImport:listIds', (_event, dir) => {
    requireFirestoreModeForOverwrite();
    return overwriteImport.listOverwriteIds(dir);
  });
  ipcMain.handle('overwriteImport:getRecord', (_event, dir, id) => {
    requireFirestoreModeForOverwrite();
    return overwriteImport.readOverwriteRecord(dir, id);
  });
  ipcMain.handle('overwriteImport:stashFirestoreVersion', (_event, record) => {
    requireFirestoreModeForOverwrite();
    vaultEngine.stashExternalVersion(record, 'firestore-overwritten');
    return true;
  });
}

module.exports = { register };
