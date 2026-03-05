/**
 * server.js — Entry point for Cursor Share Signaling Server
 *
 * A stateless, zero-trust WebSocket relay server with room-based isolation.
 * No database, no user accounts. All state lives in memory.
 */

const WebSocket = require('ws');
const os = require('os');
const handlers = require('./handlers');
const state = require('./state');
const { startHeartbeat, initClientHeartbeat } = require('./heartbeat');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0'; // Listen on ALL interfaces so LAN clients can connect
const wss = new WebSocket.Server({ host: HOST, port: PORT });

// Start heartbeat monitor
startHeartbeat(wss);

// Action → Handler mapping
const ACTION_MAP = {
    'JOIN': null,  // special: handled inline (needs ws ref)
    'UPDATE_QUOTA': handlers.handleUpdateQuota,
    'REQUEST_BORROW': handlers.handleRequestBorrow,
    'AGREE_BORROW': handlers.handleAgreeBorrow,
    'REJECT_BORROW': handlers.handleRejectBorrow,
    'BORROW_SUCCESS': handlers.handleBorrowSuccess,
    'RETURN_TOKEN': handlers.handleReturnToken,
    'REVOKE_ALL': handlers.handleRevokeAll,
};

wss.on('connection', (ws) => {
    let currentId = null;
    let currentRoomId = null;

    // Init heartbeat for this connection
    initClientHeartbeat(ws);

    ws.on('message', (raw) => {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            console.error('[!] Invalid JSON received:', e.message);
            return;
        }

        const { action, payload } = parsed;

        if (!action || !payload) {
            console.error('[!] Missing action or payload');
            return;
        }

        // Special case: JOIN needs ws reference and returns context
        if (action === 'JOIN') {
            const result = handlers.handleJoin(ws, payload);
            if (result) {
                currentId = result.clientId;
                currentRoomId = result.roomId;
            }
            return;
        }

        // Guard: must have joined first
        if (!currentId) {
            console.error('[!] Client sent action before JOIN:', action);
            return;
        }

        // Dispatch to handler
        const handler = ACTION_MAP[action];
        if (handler) {
            handler(currentId, payload);
        } else {
            console.warn(`[?] Unknown action: ${action}`);
        }
    });

    ws.on('close', () => {
        handlers.handleDisconnect(currentId);
    });

    ws.on('error', (err) => {
        console.error(`[!] WebSocket error for ${currentId}:`, err.message);
    });
});

function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'unknown';
}
const localIP = getLocalIP();

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   Cursor Share Signaling Server  v2.0       ║');
console.log(`║   Local:  ws://localhost:${PORT}                ║`);
console.log(`║   LAN:    ws://${localIP}:${PORT}          ║`);
console.log('║   Mode:   🏠 Room-based isolation           ║');
console.log('║   Status: ✅ Ready                           ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');
console.log(`👉 Teammates connect at: ws://${localIP}:${PORT}`);
console.log('');
