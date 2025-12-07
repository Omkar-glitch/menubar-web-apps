const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getSites: () => ipcRenderer.invoke('get-sites'),
    addSite: (site) => ipcRenderer.invoke('add-site', site),
    removeSite: (siteId) => ipcRenderer.invoke('remove-site', siteId),
    updateSite: (site) => ipcRenderer.invoke('update-site', site),
    onSitesUpdated: (callback) => ipcRenderer.on('sites-updated', (event, sites) => callback(sites))
});
