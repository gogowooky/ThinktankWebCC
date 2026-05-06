'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  storage: {
    listMeta:   ()        => ipcRenderer.invoke('storage:listMeta'),
    getContent: (id)      => ipcRenderer.invoke('storage:getContent', id),
    save:       (payload) => ipcRenderer.invoke('storage:save', payload),
    delete:     (id)      => ipcRenderer.invoke('storage:delete', id),
    search:         (query)     => ipcRenderer.invoke('storage:search', query),
    syncFromServer: (serverUrl) => ipcRenderer.invoke('storage:syncFromServer', serverUrl),
  },
});
