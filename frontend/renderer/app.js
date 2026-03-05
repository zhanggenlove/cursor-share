/**
 * app.js — Renderer logic for Cursor Share
 *
 * Orchestrates: room selection → credentials loading → WS connect → UI updates
 */

// i18n is loaded via <script> tag before this file (../lib/i18n.js)
// Available globals: t, setLocale, getLocale

// Server URL is configurable from the room screen UI

// ─── State ──────────────────────────────────────────────
const state = {
    myId: null,
    myEmail: null,
    myQuota: null,
    myMaxQuota: null,
    credentials: null,
    teamList: [],
    notifications: new Map(),  // from_id → { from_email, pub_key }
    pendingKeyPairs: {},      // requestId → { publicKey, privateKey }
    isBorrowing: false,
    borrowingFrom: null,
    roomId: null,
    roomPassword: null,
    serverUrl: 'ws://120.48.12.81:8080',  // default, overridden by user input
    appStarted: false,       // prevent double-start
};

// ─── DOM Refs ───────────────────────────────────────────
const el = {
    // Room screen
    roomScreen: document.getElementById('roomScreen'),
    mainApp: document.getElementById('mainApp'),
    serverUrl: document.getElementById('serverUrl'),
    tabCreate: document.getElementById('tabCreate'),
    tabJoin: document.getElementById('tabJoin'),
    panelCreate: document.getElementById('panelCreate'),
    panelJoin: document.getElementById('panelJoin'),
    createName: document.getElementById('createName'),
    createResult: document.getElementById('createResult'),
    createRoomId: document.getElementById('createRoomId'),
    createPassword: document.getElementById('createPassword'),
    btnCreateRoom: document.getElementById('btnCreateRoom'),
    btnCopyRoomInfo: document.getElementById('btnCopyRoomInfo'),
    btnEnterCreated: document.getElementById('btnEnterCreated'),
    joinRoomId: document.getElementById('joinRoomId'),
    joinPassword: document.getElementById('joinPassword'),
    btnJoinRoom: document.getElementById('btnJoinRoom'),
    roomError: document.getElementById('roomError'),
    // Main app
    roomNameDisplay: document.getElementById('roomNameDisplay'),
    btnSwitchRoom: document.getElementById('btnSwitchRoom'),
    connectionDot: document.getElementById('connectionDot'),
    userEmail: document.getElementById('userEmail'),
    borrowingBadge: document.getElementById('borrowingBadge'),
    borrowingBadgeText: document.getElementById('borrowingBadgeText'),
    borrowingFrom: document.getElementById('borrowingFrom'),
    quotaText: document.getElementById('quotaText'),
    quotaBar: document.getElementById('quotaBar'),
    teamList: document.getElementById('teamList'),
    onlineCount: document.getElementById('onlineCount'),
    btnRevoke: document.getElementById('btnRevoke'),
    btnRestore: document.getElementById('btnRestore'),
    btnRefreshQuota: document.getElementById('btnRefreshQuota'),
};

// ─── i18n Helper: Apply translations to data-i18n elements ──
function applyI18n() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    // Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    // Titles (tooltips)
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.getAttribute('data-i18n-title'));
    });
}

// ─── Room Selection Logic ───────────────────────────────

function setupRoomScreen() {
    // Tab switching
    el.tabCreate.addEventListener('click', () => {
        el.tabCreate.classList.add('active');
        el.tabJoin.classList.remove('active');
        el.panelCreate.classList.add('active');
        el.panelJoin.classList.remove('active');
        el.roomError.classList.add('hidden');
    });

    el.tabJoin.addEventListener('click', () => {
        el.tabJoin.classList.add('active');
        el.tabCreate.classList.remove('active');
        el.panelJoin.classList.add('active');
        el.panelCreate.classList.remove('active');
        el.roomError.classList.add('hidden');
    });

    // Create room: generate roomId + password
    el.btnCreateRoom.addEventListener('click', () => {
        const name = el.createName.value.trim();
        if (!name) {
            showRoomError(t('room.errorName'));
            return;
        }
        const slug = name.toLowerCase().replace(/\s+/g, '-');
        const suffix = Math.random().toString(36).substring(2, 6);
        const roomId = `${slug}-${suffix}`;
        const password = String(Math.floor(100000 + Math.random() * 900000));

        el.createRoomId.textContent = roomId;
        el.createPassword.textContent = password;
        el.createResult.classList.remove('hidden');
        el.btnCreateRoom.classList.add('hidden');
        el.btnEnterCreated.classList.remove('hidden');

        el.btnEnterCreated._roomId = roomId;
        el.btnEnterCreated._password = password;
    });

    // Copy room info to clipboard
    el.btnCopyRoomInfo.addEventListener('click', () => {
        const serverUrl = el.serverUrl.value.trim();
        const roomId = el.createRoomId.textContent;
        const password = el.createPassword.textContent;
        const text = t('room.copyText', { serverUrl, roomId, password });
        navigator.clipboard.writeText(text).then(() => {
            el.btnCopyRoomInfo.textContent = t('room.copied');
            setTimeout(() => { el.btnCopyRoomInfo.textContent = t('room.copyBtn'); }, 2000);
        });
    });

    // Enter created room
    el.btnEnterCreated.addEventListener('click', () => {
        enterRoom(el.btnEnterCreated._roomId, el.btnEnterCreated._password);
    });

    // Join existing room
    el.btnJoinRoom.addEventListener('click', () => {
        const roomId = el.joinRoomId.value.trim();
        const password = el.joinPassword.value.trim();
        if (!roomId || !password) {
            showRoomError(t('room.errorFields'));
            return;
        }
        enterRoom(roomId, password);
    });

    // Switch room button
    el.btnSwitchRoom.addEventListener('click', async () => {
        const result = await window.api.showDialog({
            type: 'warning',
            title: t('room.switch.title'),
            message: t('room.switch.message'),
            detail: t('room.switch.detail'),
            buttons: [t('room.switch.confirm'), t('tray.forceKick.cancel')],
        });
        if (result.data !== 0) return;

        await window.api.clearRoomConfig();
        await window.api.wsDisconnect();
        state.roomId = null;
        state.roomPassword = null;
        state.appStarted = false;
        showRoomScreen();
    });
}

function showRoomError(msg) {
    el.roomError.textContent = msg;
    el.roomError.classList.remove('hidden');
}

function showRoomScreen() {
    el.roomScreen.classList.remove('hidden');
    el.mainApp.classList.add('hidden');
    // Reset form state
    el.createResult.classList.add('hidden');
    el.btnCreateRoom.classList.remove('hidden');
    el.btnEnterCreated.classList.add('hidden');
    el.roomError.classList.add('hidden');
    el.createName.value = '';
    el.joinRoomId.value = '';
    el.joinPassword.value = '';
}

function showMainApp() {
    el.roomScreen.classList.add('hidden');
    el.mainApp.classList.remove('hidden');
    el.roomNameDisplay.textContent = state.roomId;
}

async function enterRoom(roomId, password) {
    const serverUrl = el.serverUrl.value.trim() || 'ws://localhost:8080';
    state.roomId = roomId;
    state.roomPassword = password;
    state.serverUrl = serverUrl;

    await window.api.saveRoomConfig({ roomId, password, serverUrl });

    showMainApp();
    await startApp();
}

// ─── Init ───────────────────────────────────────────────
async function init() {
    // 0. Detect locale from main process and apply translations
    const localeResult = await window.api.getLocale();
    if (localeResult.ok) {
        setLocale(localeResult.data);
    }
    applyI18n();

    setupRoomScreen();

    // 1. Load credentials
    const credResult = await window.api.getCredentials();
    if (credResult.ok) {
        state.credentials = credResult.data;
        state.myEmail = credResult.data.email;
        // Use unique connection ID to avoid collisions when two users share the same Cursor userId
        const suffix = Math.random().toString(36).substring(2, 6);
        state.myId = credResult.data.userId + '_' + suffix;
        el.userEmail.textContent = state.myEmail || t('app.unknownUser');
    } else {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        state.myId = 'guest_' + randomSuffix;
        state.myEmail = 'guest_' + randomSuffix + '@unknown';
        el.userEmail.textContent = state.myEmail + ' ' + t('app.cursorNotDetected');
    }

    // 2. Check saved room config
    const roomConfig = await window.api.getRoomConfig();
    if (roomConfig.ok && roomConfig.data) {
        state.roomId = roomConfig.data.roomId;
        state.roomPassword = roomConfig.data.password;
        state.serverUrl = roomConfig.data.serverUrl || 'ws://localhost:8080';
        el.serverUrl.value = state.serverUrl;
        showMainApp();
        await startApp();
    } else {
        showRoomScreen();
    }
}

async function startApp() {
    if (state.appStarted) return;
    state.appStarted = true;

    // 1. Fetch usage quota
    await refreshQuota();

    // 2. Check borrowing state
    const backupResult = await window.api.hasBackup();
    if (backupResult.ok && backupResult.data) {
        state.isBorrowing = true;
        el.borrowingBadge.classList.remove('hidden');
        el.borrowingFrom.textContent = t('app.borrowed');
    }

    // 3. Setup WS listeners BEFORE connecting
    window.api.onWsMessage(handleWsMessage);
    window.api.onWsStatus(handleWsStatus);

    // 4. Connect to signaling server
    await window.api.wsConnect(state.serverUrl);

    // 5. Setup button handlers
    el.btnRevoke.addEventListener('click', handleRevoke);
    el.btnRestore.addEventListener('click', handleRestore);
    el.btnRefreshQuota.addEventListener('click', () => refreshQuota());

    // 6. Periodic quota refresh (every 5 minutes)
    setInterval(refreshQuota, 5 * 60 * 1000);
}

// ─── Quota ──────────────────────────────────────────────
async function refreshQuota() {
    const usageResult = await window.api.getUsage();
    if (usageResult.ok) {
        const gpt4 = usageResult.data.models?.['gpt-4'];
        if (gpt4) {
            state.myQuota = gpt4.remaining;
            state.myMaxQuota = gpt4.max;
            const used = gpt4.used;
            const max = gpt4.max || '∞';
            el.quotaText.textContent = `${used} / ${max}`;

            if (gpt4.max) {
                const pct = Math.max(0, ((gpt4.max - used) / gpt4.max) * 100);
                el.quotaBar.style.width = pct + '%';
                el.quotaBar.className = 'progress-bar-fill';
                if (pct < 10) el.quotaBar.classList.add('red');
                else if (pct < 30) el.quotaBar.classList.add('orange');
            }

            // Sync quota to signaling server
            window.api.wsSend('UPDATE_QUOTA', { quota: gpt4.remaining });
        }
    }
}

// ─── WebSocket Events ───────────────────────────────────
function handleWsStatus(status) {
    if (status === 'connected') {
        el.connectionDot.className = 'connection-dot online';
        el.connectionDot.title = t('app.connected');

        // JOIN with roomId + password
        window.api.wsSend('JOIN', {
            id: state.myId,
            email: state.myEmail,
            quota: state.myQuota || 0,
            roomId: state.roomId,
            password: state.roomPassword,
        });
    } else {
        el.connectionDot.className = 'connection-dot offline';
        el.connectionDot.title = t('app.disconnected');
    }
}

function handleWsMessage(msg) {
    switch (msg.action) {
        case 'SYNC_LIST':
            handleSyncList(msg.data);
            break;
        case 'JOIN_OK':
            console.log('[Room] Joined room:', msg.payload.roomId);
            break;
        case 'JOIN_FAILED':
            handleJoinFailed(msg.payload);
            break;
        case 'INCOMING_REQUEST':
            handleIncomingRequest(msg.payload);
            break;
        case 'BORROW_APPROVED':
            handleBorrowApproved(msg.payload);
            break;
        case 'BORROW_REJECTED':
            handleBorrowRejected(msg.payload);
            break;
        case 'BORROWER_ACTIVATED':
            handleBorrowerActivated(msg.payload);
            break;
        case 'BORROWER_RETURNED':
            handleBorrowerReturned(msg.payload);
            break;
        case 'KICKED_OUT':
            handleKickedOut(msg.payload);
            break;
        case 'REQUEST_FAILED':
            showToast(t('toast.requestFailed', { reason: msg.payload.reason }), 'error');
            break;
        case 'DONOR_OFFLINE':
            window.api.showNotification('Cursor Share', t('notify.donorOffline', { email: msg.payload.donor_email }));
            break;
        case 'BORROWER_OFFLINE':
            window.api.showNotification('Cursor Share', t('notify.borrowerOffline', { email: msg.payload.borrower_email }));
            break;
    }
}

// ─── JOIN_FAILED: Wrong password → back to room screen ──
async function handleJoinFailed(payload) {
    await window.api.clearRoomConfig();
    await window.api.wsDisconnect();
    state.roomId = null;
    state.roomPassword = null;
    state.appStarted = false;
    showRoomScreen();
    showRoomError(payload.reason || t('room.joinFailed'));
}

// ─── SYNC_LIST: Update team directory ───────────────────
function handleSyncList(list) {
    list.sort((a, b) => {
        if (a.id === state.myId) return -1;
        if (b.id === state.myId) return 1;
        return (a.email || '').localeCompare(b.email || '');
    });

    state.teamList = list;
    renderTeamList();
}

function renderTeamList() {
    const list = state.teamList;
    el.onlineCount.textContent = list.length;

    if (list.length === 0) {
        el.teamList.innerHTML = `<div class="empty-state">${t('app.noMembers')}</div>`;
        return;
    }

    el.teamList.innerHTML = '';

    list.forEach(member => {
        const isSelf = member.id === state.myId;
        const card = document.createElement('div');
        card.className = 'member-card' + (isSelf ? ' is-self' : '');

        const emailDisplay = member.email || t('app.unknownUser');
        const quotaDisplay = member.quota != null ? member.quota : '--';
        const sharingTag = member.using_count > 0
            ? `<span class="sharing-tag">${t('team.sharing', { count: member.using_count })}</span>`
            : '';
        const borrowingTag = member.using_from
            ? `<span class="sharing-tag">${t('team.borrowing')}</span>`
            : '';

        card.innerHTML = `
            <div class="member-info">
                <span class="member-email">${isSelf ? '⭐ ' : ''}${emailDisplay}</span>
                <div class="member-meta">
                    <span class="member-quota">${t('team.remaining', { quota: quotaDisplay })}</span>
                    ${sharingTag}
                    ${borrowingTag}
                </div>
            </div>
        `;

        // Check if this member has a pending borrow request to us
        const notif = state.notifications.get(member.id);
        if (notif) {
            const requestBar = document.createElement('div');
            requestBar.className = 'inline-request';
            requestBar.innerHTML = `
                <span class="inline-request-text">${t('team.requestLabel')}</span>
                <div class="inline-request-actions">
                    <button class="btn-approve">${t('team.approveBtn')}</button>
                    <button class="btn-reject">${t('team.rejectBtn')}</button>
                </div>
            `;
            requestBar.querySelector('.btn-approve').addEventListener('click', () => approveBorrow(member.id));
            requestBar.querySelector('.btn-reject').addEventListener('click', () => rejectBorrow(member.id));
            card.appendChild(requestBar);
            card.classList.add('has-request');
        } else if (!isSelf && !state.isBorrowing) {
            const btn = document.createElement('button');
            btn.className = 'btn-borrow';
            btn.textContent = t('team.borrowBtn');
            btn.addEventListener('click', () => requestBorrow(member.id));
            card.appendChild(btn);
        }

        el.teamList.appendChild(card);
    });
}

// ─── Request Borrow Flow ────────────────────────────────
async function requestBorrow(targetId) {
    const kpResult = await window.api.generateKeyPair();
    if (!kpResult.ok) {
        showToast(t('toast.keygenFail'), 'error');
        return;
    }

    state.pendingKeyPairs[targetId] = kpResult.data;

    await window.api.wsSend('REQUEST_BORROW', {
        target_id: targetId,
        pub_key: kpResult.data.publicKey,
    });

    showToast(t('toast.requestSent'), 'info');
}

// ─── Incoming Borrow Request (deduplicate by from_id) ───
function handleIncomingRequest(payload) {
    const { from_id, from_email, pub_key } = payload;

    // Upsert: always keep the latest pub_key
    state.notifications.set(from_id, { from_email, pub_key });

    // Re-render team list to show inline buttons
    renderTeamList();

    window.api.showNotification('Cursor Share', t('notify.borrowRequest', { email: from_email }));
}

async function approveBorrow(fromId) {
    const notif = state.notifications.get(fromId);
    if (!notif) return;

    const credResult = await window.api.getCredentials();
    if (!credResult.ok) {
        showToast(t('toast.credsFail'), 'error');
        return;
    }

    const tokenData = JSON.stringify({
        accessToken: credResult.data.accessToken,
        refreshToken: credResult.data.refreshToken,
    });

    const encResult = await window.api.encryptToken(tokenData, notif.pub_key);
    if (!encResult.ok) {
        showToast(t('toast.encryptFail', { error: encResult.error }), 'error');
        return;
    }

    await window.api.wsSend('AGREE_BORROW', {
        requester_id: fromId,
        encrypted_token: encResult.data,
    });

    state.notifications.delete(fromId);
    renderTeamList();

    showToast(t('toast.approved', { email: notif.from_email }), 'success');
}

async function rejectBorrow(fromId) {
    const notif = state.notifications.get(fromId);
    if (!notif) return;

    await window.api.wsSend('REJECT_BORROW', {
        requester_id: fromId,
        reason: t('server.defaultReject'),
    });

    state.notifications.delete(fromId);
    renderTeamList();

    showToast(t('toast.rejected', { email: notif.from_email }), 'info');
}

// ─── Borrow Approved: Decrypt & Write Token ─────────────
async function handleBorrowApproved(payload) {
    const { donor_id, donor_email, encrypted_token } = payload;

    const keyPair = state.pendingKeyPairs[donor_id];
    if (!keyPair) {
        showToast(t('toast.keyLost'), 'error');
        return;
    }

    const decResult = await window.api.decryptToken(encrypted_token, keyPair.privateKey);
    if (!decResult.ok) {
        showToast(t('toast.decryptFail'), 'error');
        return;
    }

    const tokenData = JSON.parse(decResult.data);

    const cursorCheck = await window.api.checkCursorRunning();
    const isCursorRunning = cursorCheck.ok && cursorCheck.data;

    const writeResult = await window.api.writeToken(tokenData.accessToken, tokenData.refreshToken);
    if (!writeResult.ok) {
        showToast(t('toast.writeFail', { error: writeResult.error }), 'error');
        return;
    }

    await window.api.wsSend('BORROW_SUCCESS', { donor_id });

    state.isBorrowing = true;
    state.borrowingFrom = donor_email;
    el.borrowingBadge.classList.remove('hidden');
    el.borrowingFrom.textContent = donor_email;

    delete state.pendingKeyPairs[donor_id];

    if (isCursorRunning) {
        const result = await window.api.showDialog({
            type: 'info',
            title: 'Cursor Share',
            message: t('dialog.borrowApproved.message', { email: donor_email }),
            detail: t('dialog.borrowApproved.detail'),
            buttons: [t('dialog.restartCursor'), t('dialog.restartLater')],
        });
        if (result.data === 0) {
            showToast(t('toast.restartingCursor'), 'info');
            await window.api.restartCursor();
        }
    } else {
        await window.api.showDialog({
            type: 'info',
            title: 'Cursor Share',
            message: t('dialog.borrowSuccess.message'),
            detail: t('dialog.borrowSuccess.detail', { email: donor_email }),
            buttons: [t('dialog.ok')],
        });
    }

    setTimeout(refreshQuota, 1000);
}

function handleBorrowRejected(payload) {
    window.api.showNotification('Cursor Share', t('notify.borrowRejected', { email: payload.donor_email }));
    delete state.pendingKeyPairs[payload.donor_id];
}

function handleBorrowerActivated(payload) {
    window.api.showNotification('Cursor Share', t('notify.borrowerActivated', { email: payload.borrower_email }));
}

function handleBorrowerReturned(payload) {
    window.api.showNotification('Cursor Share', t('notify.borrowerReturned', { email: payload.borrower_email }));
}

// ─── KICKED_OUT: Auto-restore ───────────────────────────
async function handleKickedOut(payload) {
    const { by_email, reason } = payload;

    const restoreResult = await window.api.restoreBackup();
    if (restoreResult.ok) {
        state.isBorrowing = false;
        state.borrowingFrom = null;
        el.borrowingBadge.classList.add('hidden');
    }

    const cursorCheck = await window.api.checkCursorRunning();
    const isCursorRunning = cursorCheck.ok && cursorCheck.data;

    const result = await window.api.showDialog({
        type: 'warning',
        title: t('dialog.kicked.title'),
        message: t('dialog.kicked.message', { email: by_email }),
        detail: t('dialog.kicked.detail'),
        buttons: isCursorRunning ? [t('dialog.restartCursor'), t('dialog.restartLater')] : [t('dialog.ok')],
    });
    if (isCursorRunning && result.data === 0) {
        showToast(t('toast.restartingCursor'), 'info');
        await window.api.restartCursor();
    }

    setTimeout(refreshQuota, 1000);
}

// ─── Footer Button Handlers ─────────────────────────────
async function handleRevoke() {
    const result = await window.api.showDialog({
        type: 'warning',
        title: t('dialog.revoke.title'),
        message: t('dialog.revoke.message'),
        detail: t('dialog.revoke.detail'),
        buttons: [t('dialog.revoke.confirm'), t('tray.forceKick.cancel')],
    });
    if (result.data !== 0) return;

    // 1. Refresh token via Cursor API (core action)
    const refreshResult = await window.api.refreshToken();
    if (!refreshResult.ok) {
        showToast(t('toast.refreshFail', { error: refreshResult.error }), 'error');
        return;
    }

    // 2. Try to notify borrowers via WS (best effort)
    try { await window.api.wsSend('REVOKE_ALL', {}); } catch (e) { /* not connected, ok */ }

    // 3. Prompt user to restart Cursor
    const cursorCheck = await window.api.checkCursorRunning();
    const isCursorRunning = cursorCheck.ok && cursorCheck.data;

    const restartResult = await window.api.showDialog({
        type: 'info',
        title: 'Cursor Share',
        message: t('dialog.revoke.success'),
        detail: t('dialog.revoke.successDetail'),
        buttons: isCursorRunning ? [t('dialog.restartCursor'), t('dialog.restartLater')] : [t('dialog.ok')],
    });
    if (isCursorRunning && restartResult.data === 0) {
        showToast(t('toast.restartingCursor'), 'info');
        await window.api.restartCursor();
    }

    setTimeout(refreshQuota, 1000);
}

async function handleRestore() {
    const backupExists = await window.api.hasBackup();
    if (!backupExists.ok || !backupExists.data) {
        await window.api.showDialog({
            type: 'info',
            title: 'Cursor Share',
            message: t('dialog.restore.usingOwn'),
            detail: t('dialog.restore.usingOwnDetail'),
            buttons: [t('dialog.ok')],
        });
        return;
    }

    const result = await window.api.showDialog({
        type: 'warning',
        title: t('dialog.restore.title'),
        message: t('dialog.restore.message'),
        detail: t('dialog.restore.detail'),
        buttons: [t('dialog.restore.confirm'), t('tray.forceKick.cancel')],
    });
    if (result.data !== 0) return;

    // Try to notify donor via WS (best effort — may not be connected)
    try { await window.api.wsSend('RETURN_TOKEN', {}); } catch (e) { /* not connected, ok */ }

    const restoreResult = await window.api.restoreBackup();
    if (!restoreResult.ok) {
        showToast(t('toast.restoreFail', { error: restoreResult.error }), 'error');
        return;
    }

    state.isBorrowing = false;
    state.borrowingFrom = null;
    el.borrowingBadge.classList.add('hidden');

    const cursorCheck = await window.api.checkCursorRunning();
    const isCursorRunning = cursorCheck.ok && cursorCheck.data;

    if (isCursorRunning) {
        const restartResult = await window.api.showDialog({
            type: 'info',
            title: 'Cursor Share',
            message: t('dialog.restore.success'),
            detail: t('dialog.restore.successDetail'),
            buttons: [t('dialog.restartCursor'), t('dialog.restartLater')],
        });
        if (restartResult.data === 0) {
            showToast(t('toast.restartingCursor'), 'info');
            await window.api.restartCursor();
        }
    } else {
        await window.api.showDialog({
            type: 'info',
            title: 'Cursor Share',
            message: t('dialog.restore.successOffline'),
            detail: t('dialog.restore.successOfflineDetail'),
            buttons: [t('dialog.ok')],
        });
    }

    setTimeout(refreshQuota, 1000);
}

// ─── Toast Helper ───────────────────────────────────────
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// ─── Start ──────────────────────────────────────────────
init();
