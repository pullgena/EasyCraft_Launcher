const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  fetchVersions: () => ipcRenderer.invoke('fetch-versions'),
  loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
  logout: () => ipcRenderer.invoke('logout'),

  createInstance: data => ipcRenderer.invoke('create-instance', data),
  selectInstance: id => ipcRenderer.invoke('select-instance', id),
  deleteInstance: id => ipcRenderer.invoke('delete-instance', id),
  updateInstance: (id, patch) => ipcRenderer.invoke('update-instance', id, patch),
  updateInstanceSettings: (id, patch) => ipcRenderer.invoke('update-instance-settings', id, patch),
  pickJava: () => ipcRenderer.invoke('pick-java'),

  pickContent: (id, type) => ipcRenderer.invoke('pick-content', id, type),
  addContentPaths: (id, type, paths) => ipcRenderer.invoke('add-content-paths', id, type, paths),
  listContent: (id, type) => ipcRenderer.invoke('list-content', id, type),
  toggleContent: (id, type, name) => ipcRenderer.invoke('toggle-content', id, type, name),
  deleteContent: (id, type, name) => ipcRenderer.invoke('delete-content', id, type, name),
  openContentFolder: (id, type) => ipcRenderer.invoke('open-content-folder', id, type),
  openInstanceFolder: id => ipcRenderer.invoke('open-instance-folder', id),

  modrinthSearch: (id, type, query) => ipcRenderer.invoke('modrinth-search', id, type, query),
  modrinthInstall: (id, projectId) => ipcRenderer.invoke('modrinth-install', id, projectId),
  modrinthUninstall: (id, projectId) => ipcRenderer.invoke('modrinth-uninstall', id, projectId),
  modrinthCheckUpdates: id => ipcRenderer.invoke('modrinth-check-updates', id),
  modrinthUpdate: (id, projectId) => ipcRenderer.invoke('modrinth-update', id, projectId),
  modrinthUpdateAll: id => ipcRenderer.invoke('modrinth-update-all', id),

  launchGame: id => ipcRenderer.invoke('launch-game', id),
  stopGame: id => ipcRenderer.invoke('stop-game', id),
  getLaunchState: () => ipcRenderer.invoke('get-launch-state'),

  checkLauncherUpdate: () => ipcRenderer.invoke('check-launcher-update'),
  downloadLauncherUpdate: () => ipcRenderer.invoke('download-launcher-update'),
  installLauncherUpdate: () => ipcRenderer.invoke('install-launcher-update'),

  getFilePath: file => webUtils.getPathForFile(file),

  onAccountChanged: callback => ipcRenderer.on('account-changed', (_e, value) => callback(value)),
  onStatus: callback => ipcRenderer.on('status', (_e, value) => callback(value)),
  onLaunchProgress: callback => ipcRenderer.on('launch-progress', (_e, value) => callback(value)),
  onLaunchState: callback => ipcRenderer.on('launch-state', (_e, value) => callback(value)),
  onLaunchError: callback => ipcRenderer.on('launch-error', (_e, value) => callback(value)),
  onLaunchClosed: callback => ipcRenderer.on('launch-closed', (_e, value) => callback(value)),
  onGameLog: callback => ipcRenderer.on('game-log', (_e, value) => callback(value)),
  onContentProgress: callback => ipcRenderer.on('content-progress', (_e, value) => callback(value)),
  onLauncherUpdateState: callback => ipcRenderer.on('launcher-update-state', (_e, value) => callback(value))
});
