'use strict';

/**
 * electron/ipc/storageIpc.cjs
 * storage:*（Think の読み書き・検索）と vault:*（Vault 設定・フォルダ選択）の IPC。
 *
 * electron 本体は require せず、main.cjs が作ったものを ctx で受け取る（テストから読み込めるようにするため）。
 */

const { perfTime } = require('../perfLog.cjs');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./index.cjs').IpcContext} ctx
 */
function register(ipcMain, ctx) {
  const { BrowserWindow, dialog, vaultEngine } = ctx;

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
}

module.exports = { register };
