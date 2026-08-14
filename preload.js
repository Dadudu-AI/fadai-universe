const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  quitApp: () => ipcRenderer.send('quit-app'),
  setVizMode: (mode) => ipcRenderer.send('set-viz-mode', mode),
  onVizMode: (cb) => ipcRenderer.on('set-viz-mode', (e, mode) => cb(mode)),
  setBallSkin: (skin) => ipcRenderer.send('set-ball-skin', skin),
  onBallSkin: (cb) => ipcRenderer.on('ball-skin', (e, skin) => cb(skin)),
  ballInteractive: (on) => ipcRenderer.send('ball-interactive', on),
  onAutoMic: (cb) => ipcRenderer.on('auto-mic', () => cb()),
});

contextBridge.exposeInMainWorld('soundOrbAPI', {
  openVisualizer: () => ipcRenderer.send('open-visualizer'),
  moveBall: (dx, dy) => ipcRenderer.send('move-ball', { dx, dy }),
  openBindDialog: () => ipcRenderer.send('open-bind-dialog'),
});

contextBridge.exposeInMainWorld('bindAPI', {
  listApps: () => ipcRenderer.invoke('list-apps'),
  getBoundApps: () => ipcRenderer.invoke('get-bound-apps'),
  setBoundApps: (apps) => ipcRenderer.send('set-bound-apps', apps),
});
