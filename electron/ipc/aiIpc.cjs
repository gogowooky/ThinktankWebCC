'use strict';

/**
 * electron/ipc/aiIpc.cjs
 * profile:*（ドメインプロファイル）と ai:*（ローカル AI CLI の実行・ログイン・モデル候補）の IPC。
 *
 * electron 本体は require せず、main.cjs が作ったものを ctx で受け取る（テストから読み込めるようにするため）。
 */

const shared = require('../shared-dist/index.js');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./index.cjs').IpcContext} ctx
 */
function register(ipcMain, ctx) {
  const { BrowserWindow, vaultEngine, aiCliRunner } = ctx;

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

  ipcMain.handle('ai:getAuthStatus', () => aiCliRunner.detectAiAuthentication());
  ipcMain.handle('ai:listModels', () => aiCliRunner.discoverAvailableModels());

  ipcMain.handle('ai:login', (_event, provider) => aiCliRunner.startAiAuthentication(provider, {
    onClose: () => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('ai:auth-changed', { provider });
        }
      }
    },
  }));

  ipcMain.handle('ai:getGnbNotebookTitle', (_event, notebookId) => (
    aiCliRunner.getGeminiNotebookTitle({ notebookId })
  ));

  ipcMain.handle('ai:conversation', async (_event, params) => {
    if (params?.provider === 'gnb') {
      return aiCliRunner.runGeminiNotebookConversation({
        notebookId: params?.model,
        userMessage: params?.userMessage,
        timeoutMs: params?.timeoutMs,
      });
    }

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

  // 画面の「中断」。実行中（または順番待ち中）の AI CLI を止める
  ipcMain.handle('ai:cancel', (_event, requestId) => aiCliRunner.cancelCliRun(requestId));

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
}

module.exports = { register };
