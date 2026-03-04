/**
 * heartbeat.js — Ping/Pong keepalive mechanism
 *
 * Pings all connected clients every INTERVAL ms.
 * If a client does not respond with a pong before the next ping,
 * the connection is terminated and cleaned up.
 */

const state = require('./state');
const handlers = require('./handlers');

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

function startHeartbeat(wss) {
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                // Client didn't respond to last ping — terminate
                console.log('[♥] Terminating stale connection');
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, HEARTBEAT_INTERVAL);

    wss.on('close', () => {
        clearInterval(interval);
    });
}

/**
 * Call this when a new connection is established to set up pong listener.
 */
function initClientHeartbeat(ws) {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
}

module.exports = { startHeartbeat, initClientHeartbeat };
