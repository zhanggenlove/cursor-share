/**
 * app.js — Renderer logic for Cursor Share
 *
 * Orchestrates: room selection → credentials loading → WS connect → UI updates
 */

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
    borrowingFrom: document.getElementById('borrowingFrom'),
    quotaText: document.getElementById('quotaText'),
    quotaBar: document.getElementById('quotaBar'),
    teamList: document.getElementById('teamList'),
    onlineCount: document.getElementById('onlineCount'),
    btnRevoke: document.getElementById('btnRevoke'),
    btnRestore: document.getElementById('btnRestore'),
    btnRefreshQuota: document.getElementById('btnRefreshQuota'),
};

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
            showRoomError('请输入团队名称');
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
        const text = `您的团队正在使用 Cursor Share 共享额度，以下是房间信息：\n服务器地址：${serverUrl}\n房间码：${roomId}\n密码：${password}\n请不要随意分享给别人，仅供团队内部使用`;
        navigator.clipboard.writeText(text).then(() => {
            el.btnCopyRoomInfo.textContent = '✅ 已复制';
            setTimeout(() => { el.btnCopyRoomInfo.textContent = '📋 一键复制房间信息'; }, 2000);
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
            showRoomError('请填写房间码和密码');
            return;
        }
        enterRoom(roomId, password);
    });

    // Switch room button
    el.btnSwitchRoom.addEventListener('click', async () => {
        const result = await window.api.showDialog({
            type: 'warning',
            title: 'Cursor Share — 切换房间',
            message: '确认要离开当前房间？',
            detail: '你将断开连接并返回房间选择界面。',
            buttons: ['确认切换', '取消'],
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
    setupRoomScreen();

    // 1. Load credentials
    const credResult = await window.api.getCredentials();
    if (credResult.ok) {
        state.credentials = credResult.data;
        state.myEmail = credResult.data.email;
        // Use unique connection ID to avoid collisions when two users share the same Cursor userId
        const suffix = Math.random().toString(36).substring(2, 6);
        state.myId = credResult.data.userId + '_' + suffix;
        el.userEmail.textContent = state.myEmail || '未知';
    } else {
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        state.myId = 'guest_' + randomSuffix;
        state.myEmail = 'guest_' + randomSuffix + '@unknown';
        el.userEmail.textContent = state.myEmail + ' (未检测到 Cursor)';
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
        el.borrowingFrom.textContent = '(已存档)';
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
        el.connectionDot.title = '已连接';

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
        el.connectionDot.title = '未连接';
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
            showToast('请求失败: ' + msg.payload.reason, 'error');
            break;
        case 'DONOR_OFFLINE':
            window.api.showNotification('Cursor Share', `${msg.payload.donor_email} 已离线，但借用仍有效`);
            break;
        case 'BORROWER_OFFLINE':
            window.api.showNotification('Cursor Share', `${msg.payload.borrower_email} 已离线`);
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
    showRoomError(payload.reason || '加入房间失败');
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
        el.teamList.innerHTML = '<div class="empty-state">暂无其他在线成员</div>';
        return;
    }

    el.teamList.innerHTML = '';

    list.forEach(member => {
        const isSelf = member.id === state.myId;
        const card = document.createElement('div');
        card.className = 'member-card' + (isSelf ? ' is-self' : '');

        const emailDisplay = member.email || '未知用户';
        const quotaDisplay = member.quota != null ? member.quota : '--';
        const sharingTag = member.using_count > 0
            ? `<span class="sharing-tag">共享中: ${member.using_count}人</span>`
            : '';
        const borrowingTag = member.using_from
            ? `<span class="sharing-tag">🔗 借用中</span>`
            : '';

        card.innerHTML = `
            <div class="member-info">
                <span class="member-email">${isSelf ? '⭐ ' : ''}${emailDisplay}</span>
                <div class="member-meta">
                    <span class="member-quota">剩余: ${quotaDisplay}</span>
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
                <span class="inline-request-text">申请借用你的额度</span>
                <div class="inline-request-actions">
                    <button class="btn-approve">同意</button>
                    <button class="btn-reject">拒绝</button>
                </div>
            `;
            requestBar.querySelector('.btn-approve').addEventListener('click', () => approveBorrow(member.id));
            requestBar.querySelector('.btn-reject').addEventListener('click', () => rejectBorrow(member.id));
            card.appendChild(requestBar);
            card.classList.add('has-request');
        } else if (!isSelf && !state.isBorrowing) {
            const btn = document.createElement('button');
            btn.className = 'btn-borrow';
            btn.textContent = '申请';
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
        showToast('密钥生成失败', 'error');
        return;
    }

    state.pendingKeyPairs[targetId] = kpResult.data;

    await window.api.wsSend('REQUEST_BORROW', {
        target_id: targetId,
        pub_key: kpResult.data.publicKey,
    });

    showToast('借用请求已发送，等待对方确认...', 'info');
}

// ─── Incoming Borrow Request (deduplicate by from_id) ───
function handleIncomingRequest(payload) {
    const { from_id, from_email, pub_key } = payload;

    // Upsert: always keep the latest pub_key
    state.notifications.set(from_id, { from_email, pub_key });

    // Re-render team list to show inline buttons
    renderTeamList();

    window.api.showNotification('Cursor Share', `${from_email} 申请借用你的额度`);
}

async function approveBorrow(fromId) {
    const notif = state.notifications.get(fromId);
    if (!notif) return;

    const credResult = await window.api.getCredentials();
    if (!credResult.ok) {
        showToast('读取凭证失败', 'error');
        return;
    }

    const tokenData = JSON.stringify({
        accessToken: credResult.data.accessToken,
        refreshToken: credResult.data.refreshToken,
    });

    const encResult = await window.api.encryptToken(tokenData, notif.pub_key);
    if (!encResult.ok) {
        showToast('加密失败: ' + encResult.error, 'error');
        return;
    }

    await window.api.wsSend('AGREE_BORROW', {
        requester_id: fromId,
        encrypted_token: encResult.data,
    });

    state.notifications.delete(fromId);
    renderTeamList();

    showToast(`已同意 ${notif.from_email} 的借用请求`, 'success');
}

async function rejectBorrow(fromId) {
    const notif = state.notifications.get(fromId);
    if (!notif) return;

    await window.api.wsSend('REJECT_BORROW', {
        requester_id: fromId,
        reason: '对方拒绝了你的借用请求。',
    });

    state.notifications.delete(fromId);
    renderTeamList();

    showToast(`已拒绝 ${notif.from_email} 的请求`, 'info');
}

// ─── Borrow Approved: Decrypt & Write Token ─────────────
async function handleBorrowApproved(payload) {
    const { donor_id, donor_email, encrypted_token } = payload;

    const keyPair = state.pendingKeyPairs[donor_id];
    if (!keyPair) {
        showToast('密钥丢失，无法解密', 'error');
        return;
    }

    const decResult = await window.api.decryptToken(encrypted_token, keyPair.privateKey);
    if (!decResult.ok) {
        showToast('Token 解密失败', 'error');
        return;
    }

    const tokenData = JSON.parse(decResult.data);

    const cursorCheck = await window.api.checkCursorRunning();
    const isCursorRunning = cursorCheck.ok && cursorCheck.data;

    const writeResult = await window.api.writeToken(tokenData.accessToken, tokenData.refreshToken);
    if (!writeResult.ok) {
        showToast('写入 Token 失败: ' + writeResult.error, 'error');
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
            message: `${donor_email} 已同意你的额度借用`,
            detail: '重启 Cursor 客户端会自动生效，且行且珍惜 🙏',
            buttons: ['立即重启 Cursor', '稍后重启'],
        });
        if (result.data === 0) {
            showToast('正在重启 Cursor...', 'info');
            await window.api.restartCursor();
        }
    } else {
        await window.api.showDialog({
            type: 'info',
            title: 'Cursor Share',
            message: '借用额度成功 🎉',
            detail: `你正在使用 ${donor_email} 的 Cursor 额度，且行且珍惜 🙏`,
            buttons: ['我知道了'],
        });
    }

    setTimeout(refreshQuota, 1000);
}

function handleBorrowRejected(payload) {
    window.api.showNotification('Cursor Share', `${payload.donor_email} 拒绝了你的借用请求`);
    delete state.pendingKeyPairs[payload.donor_id];
}

function handleBorrowerActivated(payload) {
    window.api.showNotification('Cursor Share', `${payload.borrower_email} 已成功激活你的共享额度`);
}

function handleBorrowerReturned(payload) {
    window.api.showNotification('Cursor Share', `${payload.borrower_email} 已归还你的额度`);
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
        title: 'Cursor Share — 额度被收回',
        message: `${by_email} 已收回共享额度`,
        detail: '你的原始账号已自动恢复。需要重启 Cursor 客户端以切换回自己的账号。',
        buttons: isCursorRunning ? ['立即重启 Cursor', '稍后重启'] : ['我知道了'],
    });
    if (isCursorRunning && result.data === 0) {
        showToast('正在重启 Cursor...', 'info');
        await window.api.restartCursor();
    }

    setTimeout(refreshQuota, 1000);
}

// ─── Footer Button Handlers ─────────────────────────────
async function handleRevoke() {
    const result = await window.api.showDialog({
        type: 'warning',
        title: 'Cursor Share — 强制踢出',
        message: '确认要刷新 Token 并踢出所有借用者？',
        detail: '将调用 Cursor 服务器刷新 Token，旧 Token 立即失效。借用者将无法继续使用你的额度。',
        buttons: ['确认踢出', '取消'],
    });
    if (result.data !== 0) return;

    // 1. Refresh token via Cursor API (core action)
    const refreshResult = await window.api.refreshToken();
    if (!refreshResult.ok) {
        showToast('Token 刷新失败: ' + refreshResult.error, 'error');
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
        message: '强制踢出成功 ✅',
        detail: 'Token 已在 Cursor 服务器端刷新，旧 Token 已失效。重启 Cursor 后使用新 Token。',
        buttons: isCursorRunning ? ['立即重启 Cursor', '稍后重启'] : ['我知道了'],
    });
    if (isCursorRunning && restartResult.data === 0) {
        showToast('正在重启 Cursor...', 'info');
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
            message: '你正在使用自己的账号',
            detail: '当前没有借用记录，无需恢复。',
            buttons: ['确定'],
        });
        return;
    }

    const result = await window.api.showDialog({
        type: 'warning',
        title: 'Cursor Share — 恢复账号',
        message: '确认要恢复自己的账号？',
        detail: '这将结束当前的借用，归还对方的额度。',
        buttons: ['确认恢复', '取消'],
    });
    if (result.data !== 0) return;

    // Try to notify donor via WS (best effort — may not be connected)
    try { await window.api.wsSend('RETURN_TOKEN', {}); } catch (e) { /* not connected, ok */ }

    const restoreResult = await window.api.restoreBackup();
    if (!restoreResult.ok) {
        showToast('恢复失败: ' + restoreResult.error, 'error');
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
            message: '账号已恢复',
            detail: '你的原始 Token 已写回。重启 Cursor 客户端后生效。',
            buttons: ['立即重启 Cursor', '稍后重启'],
        });
        if (restartResult.data === 0) {
            showToast('正在重启 Cursor...', 'info');
            await window.api.restartCursor();
        }
    } else {
        await window.api.showDialog({
            type: 'info',
            title: 'Cursor Share',
            message: '账号已恢复 ✅',
            detail: '你的原始 Token 已写回，下次启动 Cursor 将使用自己的账号。',
            buttons: ['我知道了'],
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
