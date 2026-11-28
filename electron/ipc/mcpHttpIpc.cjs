'use strict';

/**
 * electron/ipc/mcpHttpIpc.cjs
 * mcpHttp:*（きなこ向け MCP HTTP 入口の設定・トークン）の IPC。
 *
 * electron 本体は require せず、main.cjs が作ったものを ctx で受け取る（テストから読み込めるようにするため）。
 */

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./index.cjs').IpcContext} ctx
 */
function register(ipcMain, ctx) {
  const { mcpHttpServer } = ctx;

  // ── IPC ハンドラー（MCP HTTP 入口） ─────────────────────────────────────────

  ipcMain.handle('mcpHttp:getStatus', () => mcpHttpServer.getStatus());
  ipcMain.handle('mcpHttp:setEnabled', (_event, enabled) => mcpHttpServer.setEnabled(Boolean(enabled)));
  ipcMain.handle('mcpHttp:configure', (_event, partial) => mcpHttpServer.configure(partial || {}));
  ipcMain.handle('mcpHttp:createToken', (_event, options) => mcpHttpServer.createToken(options || {}));
  ipcMain.handle('mcpHttp:reissueToken', (_event, options) => mcpHttpServer.reissueToken(options || {}));
  ipcMain.handle('mcpHttp:revokeToken', (_event, id) => mcpHttpServer.revokeToken(String(id || '')));
}

module.exports = { register };
