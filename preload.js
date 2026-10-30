const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dexed', {
  openFiles: () => ipcRenderer.invoke('file:open'),
  saveFile: (args) => ipcRenderer.invoke('file:save', args),
  syncMode: (mode) => ipcRenderer.send('mode:sync', mode),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action))
})
