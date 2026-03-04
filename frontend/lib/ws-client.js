/**
 * ws-client.js — WebSocket client with auto-reconnect
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');

class WSClient extends EventEmitter {
    constructor(serverUrl) {
        super();
        this.serverUrl = serverUrl;
        this.ws = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.shouldReconnect = true;
    }

    connect() {
        this.shouldReconnect = true;
        this._connect();
    }

    _connect() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) { /* ignore */ }
        }

        this.ws = new WebSocket(this.serverUrl);

        this.ws.on('open', () => {
            console.log('[WS] Connected to', this.serverUrl);
            this.reconnectDelay = 1000; // reset on success
            this.emit('connected');
        });

        this.ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                this.emit('message', msg);
                if (msg.action) {
                    this.emit(msg.action, msg.payload || msg.data);
                }
            } catch (e) {
                console.error('[WS] Failed to parse message:', e);
            }
        });

        this.ws.on('close', () => {
            try { console.log('[WS] Disconnected'); } catch (e) { /* EPIPE */ }
            this.emit('disconnected');
            this._scheduleReconnect();
        });

        this.ws.on('error', (err) => {
            try { console.error('[WS] Error:', err.message); } catch (e) { /* EPIPE */ }
            // close event will fire after error, triggering reconnect
        });

        // Respond to server pings
        this.ws.on('ping', () => {
            this.ws.pong();
        });
    }

    _scheduleReconnect() {
        if (!this.shouldReconnect) return;

        console.log(`[WS] Reconnecting in ${this.reconnectDelay / 1000}s...`);
        setTimeout(() => {
            if (this.shouldReconnect) {
                this._connect();
            }
        }, this.reconnectDelay);

        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }

    send(action, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action, payload }));
        } else {
            console.warn('[WS] Cannot send, not connected');
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close();
        }
    }

    get isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

module.exports = WSClient;
