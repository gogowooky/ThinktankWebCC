'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  storage: {
    listMeta:      ()                            => ipcRenderer.invoke('storage:listMeta'),
    getContent:    (id)                          => ipcRenderer.invoke('storage:getContent', id),
    getRecord:     (id)                          => ipcRenderer.invoke('storage:getRecord', id),
    getSupport:    (id)                          => ipcRenderer.invoke('storage:getSupport', id),
    save:          (payload)                     => ipcRenderer.invoke('storage:save', payload),
    writeBackup:   (payload)                     => ipcRenderer.invoke('storage:writeBackup', payload),
    saveSupport:   (id, metadata, expectedVer)   => ipcRenderer.invoke('storage:saveSupport', id, metadata, expectedVer),
    delete:        (id)                          => ipcRenderer.invoke('storage:delete', id),
    search:        (query)                       => ipcRenderer.invoke('storage:search', query),
  },
  vault: {
    getConfig:     ()                            => ipcRenderer.invoke('vault:getConfig'),
    setConfig:     (partial)                     => ipcRenderer.invoke('vault:setConfig', partial),
    selectFolder:  ()                            => ipcRenderer.invoke('vault:selectFolder'),
    listConflicts: ()                            => ipcRenderer.invoke('vault:listConflicts'),
    writeShard:    ()                            => ipcRenderer.invoke('vault:writeShard'),
    onMcpMutated:  (callback)                    => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('vault:mcp-mutated', handler);
      return () => ipcRenderer.removeListener('vault:mcp-mutated', handler);
    },
  },
  profile: {
    getActive:     ()                            => ipcRenderer.invoke('profile:getActive'),
    listAvailable: ()                            => ipcRenderer.invoke('profile:listAvailable'),
    setActive:     (profileId)                   => ipcRenderer.invoke('profile:setActive', profileId),
  },
  ai: {
    getStatus:     ()                            => ipcRenderer.invoke('ai:getStatus'),
    getAuthStatus: ()                            => ipcRenderer.invoke('ai:getAuthStatus'),
    login:         (provider)                    => ipcRenderer.invoke('ai:login', provider),
    getGnbNotebookTitle: (notebookId)             => ipcRenderer.invoke('ai:getGnbNotebookTitle', notebookId),
    onAuthChanged: (callback)                    => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('ai:auth-changed', handler);
      return () => ipcRenderer.removeListener('ai:auth-changed', handler);
    },
    conversation:  (params)                      => ipcRenderer.invoke('ai:conversation', params),
    agent:         (params)                      => ipcRenderer.invoke('ai:agent', params),
    cancel:        (requestId)                   => ipcRenderer.invoke('ai:cancel', requestId),
  },
  relay: {
    getStatus:       ()                          => ipcRenderer.invoke('relay:getStatus'),
    getFirebaseSession: ()                       => ipcRenderer.invoke('relay:getFirebaseSession'),
    configure:       (partial)                   => ipcRenderer.invoke('relay:configure', partial),
    rotateSecret:    ()                          => ipcRenderer.invoke('relay:rotateSecret'),
    setFirebaseSession: (session)                => ipcRenderer.invoke('relay:setFirebaseSession', session),
    signOutFirebase: ()                          => ipcRenderer.invoke('relay:signOutFirebase'),
    signInWithGoogle: (options)                  => ipcRenderer.invoke('relay:signInWithGoogle', options),
    executePlain:    (envelope)                  => ipcRenderer.invoke('relay:executePlain', envelope),
    handleEncrypted: (payload)                   => ipcRenderer.invoke('relay:handleEncrypted', payload),
  },
  system: {
    openPath:        (target)                    => ipcRenderer.invoke('system:openPath', target),
    readShortcutLink:(target)                    => ipcRenderer.invoke('system:readShortcutLink', target),
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
