const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  pingHost: (url) => ipcRenderer.invoke('ping-host', url),

  getSystemDiagnostics: () => ipcRenderer.invoke('system:getDiagnostics'),
  on: (channel, listener) => {

    // Deliberately strip event sender from listener arguments
    const subscription = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, subscription);

    // Return a cleanup function to remove the listener
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
});
