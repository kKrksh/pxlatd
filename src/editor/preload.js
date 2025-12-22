const { contextBridge, ipcRenderer } = require('electron');
const Renderer = require("../render/index.js");
const Physics = require("../physics/index.js");
const Pxlatd = require("../host/index.js");
const { app } = require('electron/main');

contextBridge.exposeInMainWorld('api', {
  readFile: () => ipcRenderer.invoke('read-file'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  createPxlatd: (name) => new Pxlatd(name),
});