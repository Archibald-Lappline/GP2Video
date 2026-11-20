const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('scoreFrameDesktop', {
  isElectron: true,
  platform: process.platform,
  openGpFile: () => ipcRenderer.invoke('dialog:openGpFile'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
});
