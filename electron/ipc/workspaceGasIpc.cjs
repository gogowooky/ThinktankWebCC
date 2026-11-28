'use strict';

/**
 * electron/ipc/workspaceGasIpc.cjs
 * workspaceGas:*（利用者の GAS 経由の Google Workspace 連携の設定・接続確認）の IPC。
 *
 * electron 本体は require せず、main.cjs が作ったものを ctx で受け取る（テストから読み込めるようにするため）。
 */

const { isValidGasUrl, testGoogleWorkspaceGas } = require('../googleWorkspaceGas.cjs');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./index.cjs').IpcContext} ctx
 */
function register(ipcMain, ctx) {
  const { vaultEngine } = ctx;

  ipcMain.handle('workspaceGas:getConfig', () => ({
    url: vaultEngine.config.workspaceGasUrl || '',
    token: vaultEngine.config.workspaceGasToken || '',
  }));

  ipcMain.handle('workspaceGas:saveConfig', (_event, partial) => {
    const url = typeof partial?.url === 'string' ? partial.url.trim() : '';
    const token = typeof partial?.token === 'string' ? partial.token.trim() : '';
    if (url && !isValidGasUrl(url)) {
      throw new Error('URLは https://script.google.com/macros/s/…/exec の形で入力してください。');
    }
    vaultEngine.saveConfig({ workspaceGasUrl: url, workspaceGasToken: token });
    return { url, token };
  });

  ipcMain.handle('workspaceGas:test', (_event, partial) => testGoogleWorkspaceGas({
    url: typeof partial?.url === 'string' ? partial.url.trim() : '',
    token: typeof partial?.token === 'string' ? partial.token.trim() : '',
  }));
}

module.exports = { register };
