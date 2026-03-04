/**
 * preload.js — Electron context bridge
 *
 * Exposes safe IPC APIs to the renderer process via window.api
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // SQLite operations
    getCredentials: () => ipcRenderer.invoke('get-credentials'),
    getUsage: () => ipcRenderer.invoke('get-usage'),
    writeToken: (accessToken, refreshToken) =>
        ipcRenderer.invoke('write-token', accessToken, refreshToken),
    restoreBackup: () => ipcRenderer.invoke('restore-backup'),
    hasBackup: () => ipcRenderer.invoke('has-backup'),

    // Crypto
    generateKeyPair: () => ipcRenderer.invoke('generate-keypair'),
    decryptToken: (ciphertext, privateKey) =>
        ipcRenderer.invoke('decrypt-token', ciphertext, privateKey),
    encryptToken: (plaintext, publicKey) =>
        ipcRenderer.invoke('encrypt-token', plaintext, publicKey),

    // WebSocket signaling
    wsConnect: (serverUrl) => ipcRenderer.invoke('ws-connect', serverUrl),
    wsSend: (action, payload) => ipcRenderer.invoke('ws-send', action, payload),
    wsDisconnect: () => ipcRenderer.invoke('ws-disconnect'),

    // Listen for messages from main process (WS events forwarded)
    onWsMessage: (callback) => {
        ipcRenderer.on('ws-message', (event, msg) => callback(msg));
    },

    // Listen for ws connection state changes
    onWsStatus: (callback) => {
        ipcRenderer.on('ws-status', (event, status) => callback(status));
    },

    // System
    showNotification: (title, body) =>
        ipcRenderer.invoke('show-notification', title, body),

    // Check if Cursor is currently running
    checkCursorRunning: () => ipcRenderer.invoke('check-cursor-running'),

    // Refresh access token via Cursor API (invalidates old token)
    refreshToken: () => ipcRenderer.invoke('refresh-token'),

    // Show a native macOS dialog (top-level alert)
    showDialog: (options) => ipcRenderer.invoke('show-dialog', options),

    // Restart Cursor app (kill + relaunch)
    restartCursor: () => ipcRenderer.invoke('restart-cursor'),

    // Room config persistence
    getRoomConfig: () => ipcRenderer.invoke('get-room-config'),
    saveRoomConfig: (config) => ipcRenderer.invoke('save-room-config', config),
    clearRoomConfig: () => ipcRenderer.invoke('clear-room-config'),
});
