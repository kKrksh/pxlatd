const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pxlatdAPI', {
  render: () => ipcRenderer.invoke('render'),
});