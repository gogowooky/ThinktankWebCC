'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// メインプロセスが additionalArguments で渡すローカルサーバーの共有シークレット。
// dev（vite proxy がヘッダーを付与する）では渡されないため undefined になる。
const apiKeyArg = process.argv.find(a => a.startsWith('--tt-api-key='));
const apiKey = apiKeyArg ? apiKeyArg.slice('--tt-api-key='.length) : undefined;

contextBridge.exposeInMainWorld('electronAPI', {
  // UI はローカルサーバー自身から配信されるため baseUrl は空（相対パスで到達できる）。
  // 認証ヘッダーだけレンダラー側で付与する必要がある。
  apiConfig: { baseUrl: '', apiKey },
  storage: {
    listMeta:   ()        => ipcRenderer.invoke('storage:listMeta'),
    getContent: (id)      => ipcRenderer.invoke('storage:getContent', id),
    save:       (payload) => ipcRenderer.invoke('storage:save', payload),
    delete:     (id)      => ipcRenderer.invoke('storage:delete', id),
    search:         (query)     => ipcRenderer.invoke('storage:search', query),
    syncFromServer: (serverUrl) => ipcRenderer.invoke('storage:syncFromServer', serverUrl),
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
