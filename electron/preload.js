const { contextBridge, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  appInfo: {
    name: 'Bug Fixer AI',
    version: '1.0.0',
    portList: ['3000', '4000'],
    url: 'http://localhost:3000',
  },
  openExternal: (url) => shell.openExternal(url),
});
