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
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
