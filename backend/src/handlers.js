/**
 * handlers.js — Room-scoped action handlers for the signaling protocol
 */

const state = require('./state');
const { broadcastDirectory, sendTo } = require('./broadcast');

// ─── JOIN (with room support) ───────────────────────────

function handleJoin(ws, payload) {
    const { id, email, quota, roomId, password } = payload;

    if (!id || !email || !roomId || !password) {
        ws.send(JSON.stringify({
            action: 'JOIN_FAILED',
            payload: { reason: '缺少必要参数 (id, email, roomId, password)' },
        }));
        return null;
    }

    if (state.hasRoom(roomId)) {
        // Room exists → verify password
        const room = state.getRoom(roomId);
        if (!state.verifyPassword(password, room.passwordHash)) {
            ws.send(JSON.stringify({
                action: 'JOIN_FAILED',
                payload: { reason: '房间密码错误' },
            }));
            return null;
        }
    } else {
        // Room doesn't exist → auto-create with this password
        state.createRoom(roomId, state.hashPassword(password));
    }

    // Add client to room
    state.addClient(roomId, id, ws, email, quota || 0);

    console.log(`[+] ${email} (${id}) joined room: ${roomId}`);

    // Send confirmation
    ws.send(JSON.stringify({
        action: 'JOIN_OK',
        payload: { roomId },
    }));

    // Broadcast updated directory to the room
    broadcastDirectory(roomId);

    return { clientId: id, roomId };
}

// ─── UPDATE_QUOTA ───────────────────────────────────────

function handleUpdateQuota(clientId, payload) {
    state.updateClientQuota(clientId, payload.quota);

    const lookup = state.getRoomByClientId(clientId);
    if (lookup) {
        broadcastDirectory(lookup.roomId);
    }
}

// ─── REQUEST_BORROW ─────────────────────────────────────

function handleRequestBorrow(clientId, payload) {
    const { target_id, pub_key } = payload;
    const requester = state.getClient(clientId);
    const target = state.getClient(target_id);

    if (!target) {
        sendTo(clientId, 'REQUEST_FAILED', { reason: '目标用户不在线' });
        return;
    }

    // Verify same room
    const requesterRoom = state.getRoomByClientId(clientId);
    const targetRoom = state.getRoomByClientId(target_id);
    if (!requesterRoom || !targetRoom || requesterRoom.roomId !== targetRoom.roomId) {
        sendTo(clientId, 'REQUEST_FAILED', { reason: '目标用户不在同一房间' });
        return;
    }

    console.log(`[>] Borrow request: ${clientId} → ${target_id}`);

    sendTo(target_id, 'INCOMING_REQUEST', {
        from_id: clientId,
        from_email: requester.email,
        pub_key,
    });
}

// ─── AGREE_BORROW ───────────────────────────────────────

function handleAgreeBorrow(donorId, payload) {
    const { requester_id, encrypted_token } = payload;
    const donor = state.getClient(donorId);

    if (!donor) return;

    console.log(`[✓] Approved: ${donorId} → ${requester_id}`);

    sendTo(requester_id, 'BORROW_APPROVED', {
        donor_id: donorId,
        donor_email: donor.email,
        encrypted_token,
    });
}

// ─── REJECT_BORROW ──────────────────────────────────────

function handleRejectBorrow(donorId, payload) {
    const { requester_id, reason } = payload;
    const donor = state.getClient(donorId);

    if (!donor) return;

    console.log(`[✗] Rejected: ${donorId} → ${requester_id}`);

    sendTo(requester_id, 'BORROW_REJECTED', {
        donor_id: donorId,
        donor_email: donor.email,
        reason: reason || '对方拒绝了你的请求',
    });
}

// ─── BORROW_SUCCESS ─────────────────────────────────────

function handleBorrowSuccess(borrowerId, payload) {
    const { donor_id } = payload;
    const borrower = state.getClient(borrowerId);

    if (!borrower) return;

    state.addRelation(donor_id, borrowerId);
    console.log(`[=] Relation: ${donor_id} sharing with ${borrowerId}`);

    sendTo(donor_id, 'BORROWER_ACTIVATED', {
        borrower_id: borrowerId,
        borrower_email: borrower.email,
    });

    const lookup = state.getRoomByClientId(borrowerId);
    if (lookup) {
        broadcastDirectory(lookup.roomId);
    }
}

// ─── RETURN_TOKEN ───────────────────────────────────────

function handleReturnToken(borrowerId, _payload) {
    const donorId = state.getDonorOf(borrowerId);
    const borrower = state.getClient(borrowerId);

    if (donorId && borrower) {
        state.removeRelation(donorId, borrowerId);
        sendTo(donorId, 'BORROWER_RETURNED', {
            borrower_id: borrowerId,
            borrower_email: borrower.email,
        });

        const lookup = state.getRoomByClientId(borrowerId);
        if (lookup) {
            broadcastDirectory(lookup.roomId);
        }
    }
}

// ─── REVOKE_ALL ─────────────────────────────────────────

function handleRevokeAll(donorId, _payload) {
    const borrowers = state.getBorrowers(donorId);
    const donor = state.getClient(donorId);

    if (!donor) return;

    console.log(`[!] REVOKE_ALL by ${donorId}, kicking ${borrowers.length} borrower(s)`);

    for (const borrowerId of borrowers) {
        sendTo(borrowerId, 'KICKED_OUT', {
            by_id: donorId,
            by_email: donor.email,
            reason: 'revoke_all',
        });
        state.removeRelation(donorId, borrowerId);
    }

    const lookup = state.getRoomByClientId(donorId);
    if (lookup) {
        broadcastDirectory(lookup.roomId);
    }
}

// ─── DISCONNECT ─────────────────────────────────────────

function handleDisconnect(clientId) {
    if (!clientId) return;

    const client = state.getClient(clientId);
    if (!client) return;

    const lookup = state.getRoomByClientId(clientId);
    const roomId = lookup ? lookup.roomId : null;

    console.log(`[-] Disconnected: ${client.email} (${clientId}) from room: ${roomId}`);

    // If this client was borrowing, notify the donor
    const donorId = state.getDonorOf(clientId);
    if (donorId) {
        sendTo(donorId, 'BORROWER_OFFLINE', {
            borrower_id: clientId,
            borrower_email: client.email,
        });
        state.removeRelation(donorId, clientId);
    }

    // If this client was a donor, notify all borrowers
    const borrowers = state.getBorrowers(clientId);
    for (const borrowerId of borrowers) {
        sendTo(borrowerId, 'DONOR_OFFLINE', {
            donor_id: clientId,
            donor_email: client.email,
        });
    }

    // Clean up all relations
    state.removeAllRelationsFor(clientId);

    // Remove client (this also cleans up empty rooms)
    state.removeClient(clientId);

    // Broadcast updated directory to the room (if it still exists)
    if (roomId && state.getRoom(roomId)) {
        broadcastDirectory(roomId);
    }
}

module.exports = {
    handleJoin,
    handleUpdateQuota,
    handleRequestBorrow,
    handleAgreeBorrow,
    handleRejectBorrow,
    handleBorrowSuccess,
    handleReturnToken,
    handleRevokeAll,
    handleDisconnect,
};
