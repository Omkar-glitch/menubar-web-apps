const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, dialog } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const Store = require('electron-store');

// Initialize settings store
const store = new Store({
    defaults: {
        sites: []
    }
});

// Store references to tray icons and windows
const trays = new Map();
const windows = new Map();
const iconCache = new Map();

let settingsWindow = null;
let currentlyOpenWindowId = null; // Track which window is currently open

// Icons directory for user data
const userIconsDir = path.join(app.getPath('userData'), 'icons');
if (!fs.existsSync(userIconsDir)) {
    fs.mkdirSync(userIconsDir, { recursive: true });
}

// Bundled icons directory (in app bundle)
const bundledIconsDir = path.join(__dirname, 'icons');

// Create main app icon from bundled PNG
function createMainAppIcon() {
    const iconPath = path.join(bundledIconsDir, 'globe.png');

    if (fs.existsSync(iconPath)) {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
            img.setTemplateImage(true);
            return img.resize({ width: 16, height: 16 });
        }
    }

    const grayPath = path.join(bundledIconsDir, 'gray.png');
    if (fs.existsSync(grayPath)) {
        const img = nativeImage.createFromPath(grayPath);
        return img.resize({ width: 16, height: 16 });
    }

    return nativeImage.createEmpty();
}

// Get colored circle icon for sites
function getColorIcon(color = '#007AFF') {
    const colorMap = {
        '#007AFF': 'blue.png',
        '#34C759': 'green.png',
        '#FF9500': 'orange.png',
        '#FF2D55': 'pink.png',
        '#AF52DE': 'purple.png',
        '#5856D6': 'indigo.png',
        '#FF3B30': 'red.png',
        '#6B7280': 'gray.png',
        '#10A37F': 'green.png',
        '#4285F4': 'blue.png',
        '#1FB8CD': 'blue.png',
        '#D97757': 'orange.png',
        '#1DA1F2': 'blue.png',
        '#7B61FF': 'purple.png'
    };

    const filename = colorMap[color] || 'blue.png';
    const iconPath = path.join(bundledIconsDir, filename);

    if (fs.existsSync(iconPath)) {
        const img = nativeImage.createFromPath(iconPath);
        if (!img.isEmpty()) {
            return img.resize({ width: 16, height: 16 });
        }
    }

    const bluePath = path.join(bundledIconsDir, 'blue.png');
    if (fs.existsSync(bluePath)) {
        const img = nativeImage.createFromPath(bluePath);
        return img.resize({ width: 16, height: 16 });
    }

    return nativeImage.createEmpty();
}

// Fetch favicon from a website
async function fetchFavicon(url, siteId) {
    return new Promise((resolve) => {
        try {
            const urlObj = new URL(url);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;

            const iconPath = path.join(userIconsDir, `${siteId}.png`);

            https.get(faviconUrl, (response) => {
                if (response.statusCode === 200) {
                    const chunks = [];
                    response.on('data', chunk => chunks.push(chunk));
                    response.on('end', () => {
                        try {
                            const buffer = Buffer.concat(chunks);
                            fs.writeFileSync(iconPath, buffer);

                            const img = nativeImage.createFromBuffer(buffer);
                            if (!img.isEmpty()) {
                                const resized = img.resize({ width: 16, height: 16 });
                                iconCache.set(siteId, resized);
                                resolve(resized);
                            } else {
                                resolve(null);
                            }
                        } catch (e) {
                            resolve(null);
                        }
                    });
                } else {
                    resolve(null);
                }
            }).on('error', () => resolve(null));
        } catch (e) {
            resolve(null);
        }
    });
}

// Get icon for a site
async function getSiteIcon(site) {
    if (site.customIcon) {
        const customPath = path.join(userIconsDir, `${site.id}_custom.png`);
        if (fs.existsSync(customPath)) {
            try {
                const img = nativeImage.createFromPath(customPath);
                if (!img.isEmpty()) {
                    return img.resize({ width: 16, height: 16 });
                }
            } catch (e) { }
        }
    }

    if (iconCache.has(site.id)) {
        const cached = iconCache.get(site.id);
        if (cached && !cached.isEmpty()) {
            return cached;
        }
    }

    const iconPath = path.join(userIconsDir, `${site.id}.png`);
    if (fs.existsSync(iconPath)) {
        try {
            const img = nativeImage.createFromPath(iconPath);
            if (!img.isEmpty()) {
                const resized = img.resize({ width: 16, height: 16 });
                iconCache.set(site.id, resized);
                return resized;
            }
        } catch (e) { }
    }

    const favicon = await fetchFavicon(site.url, site.id);
    if (favicon && !favicon.isEmpty()) {
        return favicon;
    }

    return getColorIcon(site.color || '#007AFF');
}

// Hide all other windows except the specified one
function hideAllWindowsExcept(exceptId = null) {
    windows.forEach((win, id) => {
        if (id !== exceptId && win && !win.isDestroyed() && win.isVisible()) {
            win.hide();
        }
    });

    // Also hide settings window if opening a site window
    if (exceptId !== 'settings' && settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
        settingsWindow.hide();
    }
}

// Check if a window is valid (not destroyed)
function isWindowValid(win) {
    return win && !win.isDestroyed();
}

// Create floating window for a site
function createSiteWindow(site) {
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

    const win = new BrowserWindow({
        width: site.width || 420,
        height: site.height || 650,
        x: site.x !== undefined ? site.x : screenWidth - 440,
        y: site.y !== undefined ? site.y : 30,
        show: false,
        frame: false,
        resizable: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        visibleOnAllWorkspaces: true,
        fullscreenable: false,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true
        }
    });

    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    win.loadFile('site-window.html', { query: { url: site.url, name: site.name, id: site.id } });

    // Hide window when it loses focus (clicked outside)
    win.on('blur', () => {
        if (isWindowValid(win) && win.isVisible()) {
            win.hide();
            if (currentlyOpenWindowId === site.id) {
                currentlyOpenWindowId = null;
            }
        }
    });

    // Save window position on move/resize
    let saveTimeout;
    const savePosition = () => {
        if (!isWindowValid(win)) return;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (isWindowValid(win)) {
                saveWindowPosition(site.id, win);
            }
        }, 500);
    };
    win.on('moved', savePosition);
    win.on('resized', savePosition);

    // Handle close properly
    win.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            if (isWindowValid(win)) {
                win.hide();
            }
        }
    });

    // Clean up reference when destroyed
    win.on('closed', () => {
        windows.delete(site.id);
        if (currentlyOpenWindowId === site.id) {
            currentlyOpenWindowId = null;
        }
    });

    return win;
}

// Save window position
function saveWindowPosition(siteId, win) {
    if (!isWindowValid(win)) return;

    const sites = store.get('sites');
    const bounds = win.getBounds();
    const siteIndex = sites.findIndex(s => s.id === siteId);

    if (siteIndex !== -1) {
        sites[siteIndex] = { ...sites[siteIndex], ...bounds };
        store.set('sites', sites);
    }
}

// Create tray icon for a site
async function createTrayForSite(site) {
    let icon = await getSiteIcon(site);

    if (!icon || icon.isEmpty()) {
        icon = getColorIcon(site.color || '#007AFF');
    }

    const tray = new Tray(icon);
    tray.setToolTip(site.name);

    const contextMenu = Menu.buildFromTemplate([
        { label: site.name, enabled: false },
        { type: 'separator' },
        { label: 'Open', click: () => toggleSiteWindow(site.id) },
        { label: 'Open in Browser', click: () => shell.openExternal(site.url) },
        { type: 'separator' },
        { label: 'Change Icon...', click: () => changeIcon(site.id) },
        { label: 'Remove', click: () => removeSite(site.id) }
    ]);

    tray.on('click', () => toggleSiteWindow(site.id));
    tray.on('right-click', () => tray.popUpContextMenu(contextMenu));

    return tray;
}

// Change icon for a site
async function changeIcon(siteId) {
    const result = await dialog.showOpenDialog({
        title: 'Choose Icon',
        filters: [
            { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico'] }
        ],
        properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const sourcePath = result.filePaths[0];
        const destPath = path.join(userIconsDir, `${siteId}_custom.png`);

        const img = nativeImage.createFromPath(sourcePath);
        const resized = img.resize({ width: 64, height: 64 });
        fs.writeFileSync(destPath, resized.toPNG());

        const sites = store.get('sites');
        const siteIndex = sites.findIndex(s => s.id === siteId);
        if (siteIndex !== -1) {
            sites[siteIndex].customIcon = true;
            store.set('sites', sites);
        }

        const tray = trays.get(siteId);
        if (tray) {
            const newIcon = resized.resize({ width: 16, height: 16 });
            tray.setImage(newIcon);
            iconCache.set(siteId, newIcon);
        }
    }
}

// Toggle site window visibility
function toggleSiteWindow(siteId) {
    let win = windows.get(siteId);

    // Check if window exists and is valid
    if (win && win.isDestroyed()) {
        windows.delete(siteId);
        win = null;
    }

    // Create window if it doesn't exist
    if (!win) {
        const sites = store.get('sites');
        const site = sites.find(s => s.id === siteId);
        if (site) {
            win = createSiteWindow(site);
            windows.set(siteId, win);
        } else {
            return; // Site not found
        }
    }

    if (!isWindowValid(win)) return;

    // If this window is currently open, hide it (toggle behavior)
    if (currentlyOpenWindowId === siteId && win.isVisible()) {
        win.hide();
        currentlyOpenWindowId = null;
    } else {
        // Hide all other windows first (only one window at a time)
        hideAllWindowsExcept(siteId);

        // Show this window
        win.show();
        win.focus();
        currentlyOpenWindowId = siteId;
    }
}

// Add a new site
async function addSite(site) {
    const sites = store.get('sites');
    const newSite = {
        id: Date.now().toString(),
        name: site.name,
        url: site.url,
        color: site.color || getRandomColor()
    };

    sites.push(newSite);
    store.set('sites', sites);

    const tray = await createTrayForSite(newSite);
    trays.set(newSite.id, tray);

    return newSite;
}

// Remove a site
function removeSite(siteId) {
    const sites = store.get('sites');
    const newSites = sites.filter(s => s.id !== siteId);
    store.set('sites', newSites);

    const tray = trays.get(siteId);
    if (tray) {
        tray.destroy();
        trays.delete(siteId);
    }

    const win = windows.get(siteId);
    if (isWindowValid(win)) {
        win.destroy();
    }
    windows.delete(siteId);

    if (currentlyOpenWindowId === siteId) {
        currentlyOpenWindowId = null;
    }

    try {
        const iconPath = path.join(userIconsDir, `${siteId}.png`);
        const customPath = path.join(userIconsDir, `${siteId}_custom.png`);
        if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
        if (fs.existsSync(customPath)) fs.unlinkSync(customPath);
    } catch (e) { }
    iconCache.delete(siteId);

    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('sites-updated', newSites);
    }
}

// Generate a random color
function getRandomColor() {
    const colors = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#5856D6', '#FF3B30'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Create settings window
function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        if (settingsWindow.isVisible()) {
            settingsWindow.hide();
            return;
        }
        hideAllWindowsExcept('settings');
        settingsWindow.show();
        settingsWindow.focus();
        return;
    }

    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

    settingsWindow = new BrowserWindow({
        width: 480,
        height: 620,
        x: screenWidth - 500,
        y: 30,
        resizable: true,
        minimizable: true,
        maximizable: false,
        title: 'MenuBar Web Apps',
        titleBarStyle: 'hiddenInset',
        vibrancy: 'under-window',
        backgroundColor: '#1a1a2e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    settingsWindow.loadFile('index.html');

    // Hide on blur
    settingsWindow.on('blur', () => {
        if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
            settingsWindow.hide();
        }
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });

    hideAllWindowsExcept('settings');
}

// Initialize all sites on startup
async function initializeSites() {
    const sites = store.get('sites');

    for (const site of sites) {
        const tray = await createTrayForSite(site);
        trays.set(site.id, tray);
    }
}

// Create main app tray (for settings)
let mainTray = null;

function createMainTray() {
    const icon = createMainAppIcon();

    if (icon.isEmpty()) {
        const grayIcon = getColorIcon('#6B7280');
        mainTray = new Tray(grayIcon);
    } else {
        mainTray = new Tray(icon);
    }

    mainTray.setToolTip('MenuBar Web Apps - Click to manage');

    const updateContextMenu = () => {
        const sites = store.get('sites');
        const siteItems = sites.map(site => ({
            label: site.name,
            click: () => toggleSiteWindow(site.id)
        }));

        const menuTemplate = [
            { label: 'MenuBar Web Apps', enabled: false },
            { type: 'separator' },
            ...siteItems,
            ...(siteItems.length > 0 ? [{ type: 'separator' }] : []),
            { label: 'Add New Site...', click: createSettingsWindow },
            { label: 'Settings...', click: createSettingsWindow },
            { type: 'separator' },
            { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
        ];

        return Menu.buildFromTemplate(menuTemplate);
    };

    mainTray.on('click', createSettingsWindow);
    mainTray.on('right-click', () => mainTray.popUpContextMenu(updateContextMenu()));
}

// IPC handlers
ipcMain.handle('get-sites', () => store.get('sites'));
ipcMain.handle('add-site', async (event, site) => addSite(site));
ipcMain.handle('remove-site', (event, siteId) => removeSite(siteId));
ipcMain.handle('update-site', (event, site) => {
    const sites = store.get('sites');
    const index = sites.findIndex(s => s.id === site.id);
    if (index !== -1) {
        sites[index] = { ...sites[index], ...site };
        store.set('sites', sites);
    }
    return sites;
});
ipcMain.handle('change-icon', async (event, siteId) => {
    await changeIcon(siteId);
    return store.get('sites');
});

// App lifecycle
app.whenReady().then(async () => {
    app.dock?.hide();

    createMainTray();
    await initializeSites();

    const sites = store.get('sites');
    if (sites.length === 0) {
        createSettingsWindow();
    }
});

app.on('window-all-closed', (e) => {
    e.preventDefault();
});

app.on('before-quit', () => {
    app.isQuitting = true;
});

app.on('activate', () => {
    createSettingsWindow();
});
