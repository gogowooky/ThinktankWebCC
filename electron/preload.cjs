'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// メインプロセスが additionalArguments で渡すローカルサーバーの共有シークレット。
// dev（vite proxy がヘッダーを付与する）では渡されないため undefined になる。
const apiKeyArg = process.argv.find(a => a.startsWith('--tt-api-key='));
const apiKey = apiKeyArg ? apiKeyArg.slice('--tt-api-key='.length) : undefined;

contextBridge.exposeInMainWorld('electronAPI', {
  // UI はローカルサーバーまたは app://thinktank から配信されるため baseUrl は空。
  apiConfig: { baseUrl: '', apiKey },
  storage: {
    listMeta:      ()                            => ipcRenderer.invoke('storage:listMeta'),
    getContent:    (id)                          => ipcRenderer.invoke('storage:getContent', id),
    getRecord:     (id)                          => ipcRenderer.invoke('storage:getRecord', id),
    getSupport:    (id)                          => ipcRenderer.invoke('storage:getSupport', id),
    save:          (payload)                     => ipcRenderer.invoke('storage:save', payload),
    saveSupport:   (id, metadata, expectedVer)   => ipcRenderer.invoke('storage:saveSupport', id, metadata, expectedVer),
    delete:        (id)                          => ipcRenderer.invoke('storage:delete', id),
    search:        (query)                       => ipcRenderer.invoke('storage:search', query),
    syncFromServer:(serverUrl)                   => ipcRenderer.invoke('storage:syncFromServer', serverUrl),
  },
  vault: {
    getConfig:     ()                            => ipcRenderer.invoke('vault:getConfig'),
    setConfig:     (partial)                     => ipcRenderer.invoke('vault:setConfig', partial),
    selectFolder:  ()                            => ipcRenderer.invoke('vault:selectFolder'),
    listConflicts: ()                            => ipcRenderer.invoke('vault:listConflicts'),
    writeShard:    ()                            => ipcRenderer.invoke('vault:writeShard'),
  },
  profile: {
    getActive:     ()                            => ipcRenderer.invoke('profile:getActive'),
    listAvailable: ()                            => ipcRenderer.invoke('profile:listAvailable'),
    setActive:     (profileId)                   => ipcRenderer.invoke('profile:setActive', profileId),
    saveCustom:    (profileObj)                  => ipcRenderer.invoke('profile:saveCustom', profileObj),
  },
  ai: {
    getStatus:     ()                            => ipcRenderer.invoke('ai:getStatus'),
    conversation:  (params)                      => ipcRenderer.invoke('ai:conversation', params),
    agent:         (params)                      => ipcRenderer.invoke('ai:agent', params),
  },
  relay: {
    getStatus:       ()                          => ipcRenderer.invoke('relay:getStatus'),
    configure:       (partial)                   => ipcRenderer.invoke('relay:configure', partial),
    rotateSecret:    ()                          => ipcRenderer.invoke('relay:rotateSecret'),
    executePlain:    (envelope)                  => ipcRenderer.invoke('relay:executePlain', envelope),
    handleEncrypted: (payload)                   => ipcRenderer.invoke('relay:handleEncrypted', payload),
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
