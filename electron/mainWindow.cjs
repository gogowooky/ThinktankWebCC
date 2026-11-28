'use strict';

/**
 * electron/mainWindow.cjs
 * メインウィンドウの生成（外部リンクの扱い、終了時の未保存確認、TT_SELFTEST のセルフテスト）。
 */

const { BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const { perfEnabled, perfMark } = require('./perfLog.cjs');

// ── ウィンドウ作成 ──────────────────────────────────────────────────────────

function createWindow(startUrl, { isDev, STARTUP_MODE }) {
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

module.exports = { createWindow };
