'use strict';

/**
 * electron/ipc/index.cjs
 * 画面（preload.cjs）から呼ばれる IPC ハンドラーを、窓口の種類ごとのファイルから登録する。
 *
 * @typedef {object} IpcContext
 * @property {Electron.App} app
 * @property {typeof Electron.BrowserWindow} BrowserWindow
 * @property {Electron.Dialog} dialog
 * @property {Electron.Shell} shell
 * @property {object} vaultEngine
 * @property {object} relayAgent
 * @property {object} mcpHttpServer
 * @property {object} aiCliRunner
 * @property {{ storageMode: string, localVaultDir: string, startupProblem: string }} STARTUP_MODE
 * @property {boolean} isLocalMode
 * @property {string} DEFAULT_VAULT_DIR
 * @property {() => string} appRoot
 */

const storageIpc = require('./storageIpc.cjs');
const appModeIpc = require('./appModeIpc.cjs');
const aiIpc = require('./aiIpc.cjs');
const workspaceGasIpc = require('./workspaceGasIpc.cjs');
const mcpHttpIpc = require('./mcpHttpIpc.cjs');
const relayIpc = require('./relayIpc.cjs');
const systemIpc = require('./systemIpc.cjs');

const MODULES = [storageIpc, appModeIpc, aiIpc, workspaceGasIpc, mcpHttpIpc, relayIpc, systemIpc];

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {IpcContext} ctx
 */
function registerIpcHandlers(ipcMain, ctx) {
  for (const mod of MODULES) mod.register(ipcMain, ctx);
}

module.exports = { registerIpcHandlers };
