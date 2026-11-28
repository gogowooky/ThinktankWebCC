'use strict';

/**
 * electron/ipc/relayIpc.cjs
 * relay:*（PC連携の中継役・Firebase / きなこのログイン）の IPC。
 *
 * electron 本体は require せず、main.cjs が作ったものを ctx で受け取る（テストから読み込めるようにするため）。
 */

const path = require('path');
const shared = require('../shared-dist/index.js');
const { loadDesktopClient, signInWithGoogleLoopback } = require('../googleLoopbackAuth.cjs');

const GOOGLE_DESKTOP_CLIENT_FILE = 'google-oauth-desktop.json';

/** デスクトップ用 OAuth クライアントの JSON を探す場所（userData、なければ electron/ 直下） */
function desktopClientPaths(userDataDir) {
  return [
    path.join(userDataDir, GOOGLE_DESKTOP_CLIENT_FILE),
    // このファイルは electron/ipc/ にあるので、electron/ 直下を見るには1階層上がる
    path.join(__dirname, '..', GOOGLE_DESKTOP_CLIENT_FILE),
  ];
}

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./index.cjs').IpcContext} ctx
 */
function register(ipcMain, ctx) {
  const { app, BrowserWindow, shell, relayAgent } = ctx;

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

  // きなこ専用アカウントのパスワードはここで使い切る（保存するのはリフレッシュトークンだけ）
  ipcMain.handle('relay:setKinakoPassword', async (_event, password) => {
    return relayAgent.setKinakoPassword(typeof password === 'string' ? password : '');
  });

  ipcMain.handle('relay:getKinakoAuthStatus', () => {
    return relayAgent.getKinakoAuthStatus();
  });

  ipcMain.handle('relay:signOutKinako', () => {
    return relayAgent.signOutKinako();
  });

  // 製品版の画面（app://）は Google の戻り先に登録できないため、いつものブラウザでログインしてもらう
  let googleSignInRunning = null;
  ipcMain.handle('relay:signInWithGoogle', async (_event, options) => {
    if (googleSignInRunning) throw new Error('ブラウザでのログインがすでに進行中です。ブラウザの画面を確認してください。');
    const client = loadDesktopClient(desktopClientPaths(app.getPath('userData')));
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

  ipcMain.handle('relay:handleEncrypted', async (_event, payload) => {
    return relayAgent.handleEncryptedRequest(payload);
  });
}

module.exports = { register, desktopClientPaths };
