'use strict';

/**
 * electron/ipc/systemIpc.cjs
 * system:*（OS の既定アプリで開く・フォルダ判定・.lnk のリンク先）の IPC。
 *
 * electron 本体は require せず、main.cjs が作ったものを ctx で受け取る（テストから読み込めるようにするため）。
 */

const path = require('path');
const fs = require('fs');
const { validateOpenPath } = require('../openPath.cjs');
const { validateShortcutPath } = require('../shortcutPath.cjs');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./index.cjs').IpcContext} ctx
 */
function register(ipcMain, ctx) {
  const { shell } = ctx;

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
}

module.exports = { register };
