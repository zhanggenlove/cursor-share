/**
 * broadcast.js — Room-scoped WebSocket broadcasting
 */

const state = require('./state');

/**
 * Broadcast SYNC_LIST to all clients in a specific room.
 */
function broadcastDirectory(roomId) {
    const room = state.getRoom(roomId);
    if (!room) return;

    const directory = state.getRoomDirectory(roomId);
    const message = JSON.stringify({
        action: 'SYNC_LIST',
        data: directory,
    });

    for (const [, client] of room.clients) {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
            client.ws.send(message);
        }
    }
}

/**
 * Send a message to a specific client by ID.
 */
function sendTo(targetId, action, payload) {
    const client = state.getClient(targetId);
    if (client && client.ws.readyState === 1) {
        client.ws.send(JSON.stringify({ action, payload }));
    }
}

module.exports = { broadcastDirectory, sendTo };
