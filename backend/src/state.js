/**
 * state.js — Room-based in-memory state manager
 *
 * Data structure:
 *   rooms: Map<roomId, {
 *     passwordHash: string,
 *     clients: Map<id, { ws, email, quota, publicKey }>,
 *     relations: Map<donorId, Set<borrowerId>>
 *   }>
 *
 *   clientRoom: Map<clientId, roomId>  // reverse lookup
 */

const crypto = require('crypto');

// ─── Primary State ──────────────────────────────────────
const rooms = new Map();
const clientRoom = new Map(); // clientId → roomId (for quick lookup)

// ─── Password Hashing ──────────────────────────────────
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hash) {
    return hashPassword(password) === hash;
}

// ─── Room CRUD ──────────────────────────────────────────

function createRoom(roomId, passwordHash) {
    rooms.set(roomId, {
        passwordHash,
        clients: new Map(),
        relations: new Map(),
    });
    console.log(`[Room] Created room: ${roomId}`);
}

function getRoom(roomId) {
    return rooms.get(roomId);
}

function hasRoom(roomId) {
    return rooms.has(roomId);
}

function removeRoom(roomId) {
    rooms.delete(roomId);
    console.log(`[Room] Removed empty room: ${roomId}`);
}

function getRoomByClientId(clientId) {
    const roomId = clientRoom.get(clientId);
    if (!roomId) return null;
    return { roomId, room: rooms.get(roomId) };
}

// ─── Client Management (room-scoped) ────────────────────

function addClient(roomId, id, ws, email, quota, publicKey) {
    const room = rooms.get(roomId);
    if (!room) return false;

    room.clients.set(id, { ws, email, quota, publicKey });
    clientRoom.set(id, roomId);
    return true;
}

function removeClient(id) {
    const roomId = clientRoom.get(id);
    if (!roomId) return null;

    const room = rooms.get(roomId);
    if (room) {
        room.clients.delete(id);
        // Clean up room if empty
        if (room.clients.size === 0) {
            removeRoom(roomId);
        }
    }

    clientRoom.delete(id);
    return roomId;
}

function getClient(id) {
    const lookup = getRoomByClientId(id);
    if (!lookup || !lookup.room) return null;
    return lookup.room.clients.get(id);
}

function updateClientQuota(id, quota) {
    const client = getClient(id);
    if (client) client.quota = quota;
}

// ─── Relation Management (room-scoped) ──────────────────

function addRelation(donorId, borrowerId) {
    const lookup = getRoomByClientId(donorId);
    if (!lookup || !lookup.room) return;

    const { room } = lookup;
    if (!room.relations.has(donorId)) {
        room.relations.set(donorId, new Set());
    }
    room.relations.get(donorId).add(borrowerId);
}

function removeRelation(donorId, borrowerId) {
    const lookup = getRoomByClientId(donorId);
    if (!lookup || !lookup.room) return;

    const { room } = lookup;
    const set = room.relations.get(donorId);
    if (set) {
        set.delete(borrowerId);
        if (set.size === 0) room.relations.delete(donorId);
    }
}

function getBorrowers(donorId) {
    const lookup = getRoomByClientId(donorId);
    if (!lookup || !lookup.room) return [];

    const set = lookup.room.relations.get(donorId);
    return set ? [...set] : [];
}

function getDonorOf(borrowerId) {
    const lookup = getRoomByClientId(borrowerId);
    if (!lookup || !lookup.room) return null;

    for (const [donorId, borrowers] of lookup.room.relations) {
        if (borrowers.has(borrowerId)) return donorId;
    }
    return null;
}

function removeAllRelationsFor(id) {
    const lookup = getRoomByClientId(id);
    if (!lookup || !lookup.room) return;

    const { room } = lookup;

    // Remove as donor
    room.relations.delete(id);

    // Remove as borrower
    for (const [donorId, borrowers] of room.relations) {
        borrowers.delete(id);
        if (borrowers.size === 0) room.relations.delete(donorId);
    }
}

// ─── Directory (room-scoped) ────────────────────────────

function getRoomDirectory(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];

    return [...room.clients.entries()].map(([id, c]) => ({
        id,
        email: c.email,
        quota: c.quota,
        using_count: (room.relations.get(id)?.size) || 0,
        using_from: getDonorOf(id),
    }));
}

// ─── Stats ──────────────────────────────────────────────

function getRoomCount() {
    return rooms.size;
}

function getTotalClientCount() {
    let count = 0;
    for (const room of rooms.values()) {
        count += room.clients.size;
    }
    return count;
}

module.exports = {
    // Password
    hashPassword,
    verifyPassword,
    // Room CRUD
    createRoom,
    getRoom,
    hasRoom,
    removeRoom,
    getRoomByClientId,
    // Clients
    addClient,
    removeClient,
    getClient,
    updateClientQuota,
    // Relations
    addRelation,
    removeRelation,
    getBorrowers,
    getDonorOf,
    removeAllRelationsFor,
    // Directory
    getRoomDirectory,
    // Stats
    getRoomCount,
    getTotalClientCount,
};
