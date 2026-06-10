// レンダラーとのブリッジ API 露出

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  listMeta: () => ipcRenderer.invoke('tt:listMeta'),
  getContent: (id) => ipcRenderer.invoke('tt:getContent', id),
  save: (payload) => ipcRenderer.invoke('tt:save', payload),
  delete: (id) => ipcRenderer.invoke('tt:delete', id),
  search: (query) => ipcRenderer.invoke('tt:search', query),
  syncFromServer: () => ipcRenderer.invoke('tt:syncFromServer'),
});
