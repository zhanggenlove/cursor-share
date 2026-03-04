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
    tray.setToolTip('Cursor Share');

    // Build & show native context menu on click
    const buildMenu = () => {
        const loginSettings = app.getLoginItemSettings();
        return Menu.buildFromTemplate([
            {
                label: 'Cursor Share',
                click: () => {
                    positionWindow();
                    mainWindow.show();
                    mainWindow.focus();
                },
            },
            { type: 'separator' },
            {
                label: '强制踢出（刷新 Token）',
                click: async () => {
                    const confirmResult = await dialog.showMessageBox({
                        type: 'warning',
                        icon: getAppIcon(),
                        title: 'Cursor Share — 强制踢出',
                        message: '确认要刷新 Token 并踢出所有借用者？',
                        detail: '将调用 Cursor 服务器刷新 Token，旧 Token 立即失效。',
                        buttons: ['确认踢出', '取消'],
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
                            message: '强制踢出成功 ✅',
                            detail: 'Token 已刷新，旧 Token 在 Cursor 服务器端已失效。重启 Cursor 后使用新 Token。',
                            buttons: ['我知道了'],
                        });
                    } catch (e) {
                        dialog.showMessageBox({
                            type: 'error',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: '强制踢出失败',
                            detail: e.message,
                            buttons: ['确定'],
                        });
                    }
                },
            },
            {
                label: '恢复本账号',
                click: async () => {
                    const sqliteOps = require('./lib/sqlite-ops');
                    if (!sqliteOps.hasBackup()) {
                        dialog.showMessageBox({
                            type: 'info',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: '当前没有借用记录',
                            detail: '你正在使用自己的账号，无需恢复。',
                            buttons: ['确定'],
                        });
                        return;
                    }
                    const confirmResult = await dialog.showMessageBox({
                        type: 'warning',
                        icon: getAppIcon(),
                        title: 'Cursor Share — 恢复账号',
                        message: '确认要恢复自己的账号？',
                        detail: '这将恢复你的原始 Token，之前分发的 Token 将失效。',
                        buttons: ['确认恢复', '取消'],
                    });
                    if (confirmResult.response !== 0) return;
                    try {
                        sqliteOps.restoreBackup();
                        dialog.showMessageBox({
                            type: 'info',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: '账号已恢复 ✅',
                            detail: '你的原始 Token 已写回，重启 Cursor 后生效。',
                            buttons: ['我知道了'],
                        });
                    } catch (e) {
                        dialog.showMessageBox({
                            type: 'error',
                            icon: getAppIcon(),
                            title: 'Cursor Share',
                            message: '恢复失败',
                            detail: e.message,
                            buttons: ['确定'],
                        });
                    }
                },
            },
            { type: 'separator' },
            {
                label: '开机自启动',
                type: 'checkbox',
                checked: loginSettings.openAtLogin,
                click: (menuItem) => {
                    app.setLoginItemSettings({ openAtLogin: menuItem.checked });
                },
            },
            {
                label: '关于',
                click: () => {
                    dialog.showMessageBox({
                        type: 'info',
                        icon: getAppIcon(),
                        title: '关于 Cursor Share',
                        message: 'Cursor Share v1.0',
                        detail: '团队 Cursor 额度共享工具\n\n让团队成员之间安全地共享 Cursor AI 额度。',
                        buttons: ['确定'],
                    });
                },
            },
            { type: 'separator' },
            {
                label: '退出 Cursor Share',
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
            buttons: options.buttons || ['确定'],
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
