/**
 * main.js — Electron main process
 *
 * Creates a MacOS tray icon with a popover window.
 * Handles all IPC calls from the renderer.
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Suppress error dialogs for non-critical errors (e.g. EPIPE from broken stdout)
process.on('uncaughtException', (err) => {
    try { console.error('[Main] Uncaught exception:', err.message); } catch (e) { /* EPIPE */ }
});
process.on('unhandledRejection', (reason) => {
    try { console.error('[Main] Unhandled rejection:', reason); } catch (e) { /* EPIPE */ }
});
const os = require('os');
const sqliteOps = require('./lib/sqlite-ops');
const cursorApi = require('./lib/cursor-api');
const cryptoUtils = require('./lib/crypto-utils');
const WSClient = require('./lib/ws-client');
const { t, setLocale, getLocale } = require('./lib/i18n');

const ROOM_CONFIG_PATH = path.join(os.homedir(), '.cursor-share-config.json');

let tray = null;
let mainWindow = null;
let wsClient = null;

// ─── Window Setup ───────────────────────────────────────

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 420,
        height: 680,
        show: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: true,
        vibrancy: 'under-window',
        visualEffectState: 'active',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('blur', () => {
        if (mainWindow && !mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.hide();
        }
    });
}

// ─── Tray Setup ─────────────────────────────────────────

function createTrayIcon() {
    // Both macOS and Windows: use the colored app icon
    // (disabling template image so it shows the actual colors instead of a solid square)
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    return icon.resize({ width: 16, height: 16 });
}

function getAppIcon() {
    return nativeImage.createFromPath(path.join(__dirname, 'assets', '64x64.png'));
}

function createTray() {
    const icon = createTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip(t('tray.tooltip'));

    // Build & show native context menu on click
    const buildMenu = () => {
        const loginSettings = app.getLoginItemSettings();
        return Menu.buildFromTemplate([
            {
                label: t('tray.open'),
                click: () => {
                    positionWindow();
                    mainWindow.show();
                    mainWindow.focus();
                },
            },
            { type: 'separator' },
            {
                label: t('tray.forceKick'),
                click: async () => {
                    const confirmResult = await dialog.showMessageBox({
                        type: 'warning',
                        icon: getAppIcon(),
                        title: t('tray.forceKick.title'),
                        message: t('tray.forceKick.message'),
                        detail: t('tray.forceKick.detail'),
                        buttons: [t('tray.forceKick.confirm'), t('tray.forceKick.cancel')],
                    });
                    if (confirmResult.response !== 0) return;
                    const sqliteOps = require('./lib/sqlite-ops');
                    try {
                        await sqliteOps.refreshAndWriteToken();
                        // Try to notify borrowers via WS if connected
                        try {
                            if (wsClient) wsClient.send(JSON.stringify({ action: 'REVOKE_ALL', payload: {} }));
                        } catch (e) { /* not connected, ok */ }
                        dialog.showMessageBox({
                            type: 'info',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: t('tray.forceKick.success'),
                            detail: t('tray.forceKick.successDetail'),
                            buttons: [t('tray.forceKick.ok')],
                        });
                    } catch (e) {
                        dialog.showMessageBox({
                            type: 'error',
                            icon: getAppIcon(),
                            title: t('tray.forceKick.failTitle'),
                            message: t('tray.forceKick.failMessage'),
                            detail: e.message,
                            buttons: [t('tray.forceKick.failOk')],
                        });
                    }
                },
            },
            {
                label: t('tray.restore'),
                click: async () => {
                    const sqliteOps = require('./lib/sqlite-ops');
                    if (!sqliteOps.hasBackup()) {
                        dialog.showMessageBox({
                            type: 'info',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: t('tray.restore.noBorrow'),
                            detail: t('tray.restore.noBorrowDetail'),
                            buttons: [t('dialog.ok')],
                        });
                        return;
                    }
                    const confirmResult = await dialog.showMessageBox({
                        type: 'warning',
                        icon: getAppIcon(),
                        title: t('tray.restore.title'),
                        message: t('tray.restore.message'),
                        detail: t('tray.restore.detail'),
                        buttons: [t('tray.restore.confirm'), t('tray.forceKick.cancel')],
                    });
                    if (confirmResult.response !== 0) return;
                    try {
                        sqliteOps.restoreBackup();
                        dialog.showMessageBox({
                            type: 'info',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: t('tray.restore.success'),
                            detail: t('tray.restore.successDetail'),
                            buttons: [t('tray.forceKick.ok')],
                        });
                    } catch (e) {
                        dialog.showMessageBox({
                            type: 'error',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: t('tray.restore.failMessage'),
                            detail: e.message,
                            buttons: [t('dialog.ok')],
                        });
                    }
                },
            },
            { type: 'separator' },
            {
                label: t('tray.autoStart'),
                type: 'checkbox',
                checked: loginSettings.openAtLogin,
                click: (menuItem) => {
                    app.setLoginItemSettings({ openAtLogin: menuItem.checked });
                },
            },
            {
                label: t('tray.about'),
                click: () => {
                    dialog.showMessageBox({
                        type: 'info',
                        icon: getAppIcon(),
                        title: t('tray.about.title'),
                        message: t('tray.about.message'),
                        detail: t('tray.about.detail'),
                        buttons: [t('dialog.ok')],
                    });
                },
            },
            { type: 'separator' },
            {
                label: t('tray.quit'),
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                },
            },
        ]);
    };

    tray.on('click', () => {
        if (process.platform === 'win32') {
            // On Windows, left click toggles window
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                positionWindow();
                mainWindow.show();
                mainWindow.focus();
            }
        } else {
            // On macOS, left click shows context menu
            tray.popUpContextMenu(buildMenu());
        }
    });

    tray.on('right-click', () => {
        // Right click always shows context menu
        tray.popUpContextMenu(buildMenu());
    });
}

function positionWindow() {
    const trayBounds = tray.getBounds();
    const windowBounds = mainWindow.getBounds();

    // Get the display where the tray icon is located
    const currentDisplay = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const workArea = currentDisplay.workArea;

    let x, y;

    if (process.platform === 'win32') {
        // Handle Windows taskbar positions
        if (trayBounds.y > workArea.height / 2) {
            // Taskbar is at the bottom
            x = Math.max(workArea.x, Math.min(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2, workArea.x + workArea.width - windowBounds.width));
            y = trayBounds.y - windowBounds.height - 4;
        } else if (trayBounds.y < workArea.height / 2) {
            // Taskbar is at the top
            x = Math.max(workArea.x, Math.min(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2, workArea.x + workArea.width - windowBounds.width));
            y = trayBounds.y + trayBounds.height + 4;
        } else if (trayBounds.x < workArea.width / 2) {
            // Taskbar is on the left
            x = trayBounds.x + trayBounds.width + 4;
            y = Math.max(workArea.y, Math.min(trayBounds.y + trayBounds.height / 2 - windowBounds.height / 2, workArea.y + workArea.height - windowBounds.height));
        } else {
            // Taskbar is on the right
            x = trayBounds.x - windowBounds.width - 4;
            y = Math.max(workArea.y, Math.min(trayBounds.y + trayBounds.height / 2 - windowBounds.height / 2, workArea.y + workArea.height - windowBounds.height));
        }
    } else {
        // macOS menu bar is always at the top
        x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
        y = Math.round(trayBounds.y + trayBounds.height + 4);
    }

    mainWindow.setPosition(Math.round(x), Math.round(y), false);
}

// ─── IPC Handlers ───────────────────────────────────────

function setupIPC() {
    // Locale
    ipcMain.handle('get-locale', async () => {
        return { ok: true, data: getLocale() };
    });

    // SQLite
    ipcMain.handle('get-credentials', async () => {
        try {
            return { ok: true, data: sqliteOps.readCredentials() };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('get-usage', async () => {
        try {
            const creds = sqliteOps.readCredentials();
            if (!creds.userId || !creds.accessToken) {
                return { ok: false, error: 'No credentials found' };
            }
            const usage = await cursorApi.fetchUsage(creds.userId, creds.accessToken);
            return { ok: true, data: usage };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('write-token', async (event, accessToken, refreshToken) => {
        try {
            sqliteOps.backupCredentials();
            sqliteOps.writeToken(accessToken, refreshToken);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('restore-backup', async () => {
        try {
            sqliteOps.restoreBackup();
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('has-backup', async () => {
        return { ok: true, data: sqliteOps.hasBackup() };
    });

    // Crypto
    ipcMain.handle('generate-keypair', async () => {
        const kp = cryptoUtils.generateKeyPair();
        return { ok: true, data: kp };
    });

    ipcMain.handle('decrypt-token', async (event, ciphertext, privateKey) => {
        try {
            const plaintext = cryptoUtils.decrypt(ciphertext, privateKey);
            return { ok: true, data: plaintext };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('encrypt-token', async (event, plaintext, publicKey) => {
        try {
            const ciphertext = cryptoUtils.encrypt(plaintext, publicKey);
            return { ok: true, data: ciphertext };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    // WebSocket
    ipcMain.handle('ws-connect', async (event, serverUrl) => {
        try {
            if (wsClient) {
                wsClient.disconnect();
            }
            wsClient = new WSClient(serverUrl || 'ws://localhost:8080');

            wsClient.on('message', (msg) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('ws-message', msg);
                }
            });

            wsClient.on('connected', () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('ws-status', 'connected');
                }
            });

            wsClient.on('disconnected', () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('ws-status', 'disconnected');
                }
            });

            wsClient.connect();
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('ws-send', async (event, action, payload) => {
        if (wsClient && wsClient.isConnected) {
            wsClient.send(action, payload);
            return { ok: true };
        }
        return { ok: false, error: 'Not connected' };
    });

    ipcMain.handle('ws-disconnect', async () => {
        if (wsClient) {
            wsClient.disconnect();
            wsClient = null;
        }
        return { ok: true };
    });

    // System notifications
    ipcMain.handle('show-notification', async (event, title, body) => {
        new Notification({ title, body }).show();
        return { ok: true };
    });

    // Check if Cursor app is currently running (cross-platform)
    ipcMain.handle('check-cursor-running', async () => {
        const { execSync } = require('child_process');
        try {
            if (process.platform === 'win32') {
                const output = execSync('tasklist /FI "IMAGENAME eq Cursor.exe" /NH', { encoding: 'utf8' });
                return { ok: true, data: output.includes('Cursor.exe') };
            } else {
                execSync('pgrep -x "Cursor"', { stdio: 'ignore' });
                return { ok: true, data: true };
            }
        } catch (e) {
            return { ok: true, data: false }; // Cursor is NOT running
        }
    });

    // Refresh access token via Cursor API (invalidates old token)
    ipcMain.handle('refresh-token', async () => {
        const sqliteOps = require('./lib/sqlite-ops');
        try {
            const result = await sqliteOps.refreshAndWriteToken();
            return { ok: true, data: result };
        } catch (e) {
            console.error('[RefreshToken] Error:', e.message);
            return { ok: false, error: e.message };
        }
    });

    // Show a native macOS alert dialog (always on top)
    ipcMain.handle('show-dialog', async (event, options) => {
        const { dialog } = require('electron');
        const result = await dialog.showMessageBox(null, {
            type: options.type || 'info',          // 'info' | 'warning' | 'error'
            title: options.title || 'Cursor Share',
            message: options.message || '',
            detail: options.detail || '',
            buttons: options.buttons || [t('dialog.ok')],
            defaultId: 0,
            icon: getAppIcon(),
        });
        return { ok: true, data: result.response }; // button index
    });

    // Restart Cursor app (kill + relaunch)
    ipcMain.handle('restart-cursor', async () => {
        const { exec } = require('child_process');
        return new Promise((resolve) => {
            if (process.platform === 'win32') {
                // Windows: taskkill + start
                exec('taskkill /IM Cursor.exe /F', (err) => {
                    setTimeout(() => {
                        exec('start "" "Cursor"', { shell: true }, (err2) => {
                            resolve(err2 ? { ok: false, error: err2.message } : { ok: true });
                        });
                    }, 1500);
                });
            } else {
                // macOS / Linux
                exec('pkill -x "Cursor"', (err) => {
                    setTimeout(() => {
                        exec('open -a "Cursor"', (err2) => {
                            resolve(err2 ? { ok: false, error: err2.message } : { ok: true });
                        });
                    }, 1500);
                });
            }
        });
    });

    // ─── Room Config Persistence ────────────────────────────

    ipcMain.handle('get-room-config', async () => {
        try {
            if (fs.existsSync(ROOM_CONFIG_PATH)) {
                const data = JSON.parse(fs.readFileSync(ROOM_CONFIG_PATH, 'utf8'));
                return { ok: true, data };
            }
            return { ok: true, data: null };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('save-room-config', async (event, config) => {
        try {
            fs.writeFileSync(ROOM_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('clear-room-config', async () => {
        try {
            if (fs.existsSync(ROOM_CONFIG_PATH)) {
                fs.unlinkSync(ROOM_CONFIG_PATH);
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });
}

// ─── App Lifecycle ──────────────────────────────────────

app.whenReady().then(() => {
    // Auto-detect system locale and configure i18n
    setLocale(app.getLocale());

    // Hide dock icon — menu bar only app
    if (app.dock) app.dock.hide();

    createWindow();
    createTray();
    setupIPC();

    console.log('[App] Ready. Click the menu bar icon (⚡) to open.');
});

app.on('window-all-closed', (e) => {
    e.preventDefault(); // Keep tray running
});

app.on('before-quit', () => {
    if (wsClient) {
        wsClient.disconnect();
    }
});
