/**
 * i18n.js — Lightweight internationalization module for Cursor Share
 *
 * Default language: English. Additional: Chinese (zh).
 * Usage:
 *   const { t, setLocale, getLocale } = require('./i18n');
 *   setLocale('zh');
 *   t('tray.tooltip');           // → 'Cursor Share'
 *   t('dialog.approved', { email: 'a@b.com' }); // → 'a@b.com has approved...'
 */

const translations = {
    en: {
        // ─── Tray Menu ──────────────────────────────────
        'tray.tooltip': 'Cursor Share',
        'tray.open': 'Cursor Share',
        'tray.forceKick': 'Force Kick (Refresh Token)',
        'tray.forceKick.title': 'Cursor Share — Force Kick',
        'tray.forceKick.message': 'Confirm refreshing Token and kicking all borrowers?',
        'tray.forceKick.detail': 'This will call Cursor servers to refresh the Token. The old Token will be invalidated immediately.',
        'tray.forceKick.confirm': 'Confirm Kick',
        'tray.forceKick.cancel': 'Cancel',
        'tray.forceKick.success': 'Force kick successful ✅',
        'tray.forceKick.successDetail': 'Token has been refreshed. The old Token is now invalid on Cursor servers. Restart Cursor to use the new Token.',
        'tray.forceKick.ok': 'OK',
        'tray.forceKick.failTitle': 'Cursor Share',
        'tray.forceKick.failMessage': 'Force kick failed',
        'tray.forceKick.failOk': 'OK',
        'tray.restore': 'Restore My Account',
        'tray.restore.noBorrow': 'No borrow record found',
        'tray.restore.noBorrowDetail': 'You are using your own account. No need to restore.',
        'tray.restore.title': 'Cursor Share — Restore Account',
        'tray.restore.message': 'Confirm restoring your own account?',
        'tray.restore.detail': 'This will restore your original Token. Previously distributed Tokens will be invalidated.',
        'tray.restore.confirm': 'Confirm Restore',
        'tray.restore.success': 'Account restored ✅',
        'tray.restore.successDetail': 'Your original Token has been written back. Restart Cursor for it to take effect.',
        'tray.restore.failMessage': 'Restore failed',
        'tray.autoStart': 'Launch at Login',
        'tray.about': 'About',
        'tray.about.title': 'About Cursor Share',
        'tray.about.message': 'Cursor Share v1.0',
        'tray.about.detail': 'Team Cursor AI Quota Sharing Tool\n\nSecurely share Cursor AI quota among team members.',
        'tray.quit': 'Quit Cursor Share',
        'dialog.ok': 'OK',

        // ─── Room Screen ────────────────────────────────
        'room.subtitle': 'Choose a way to join your team',
        'room.serverLabel': 'Server Address',
        'room.tabCreate': 'Create Room',
        'room.tabJoin': 'Join Room',
        'room.teamName': 'Team Name',
        'room.teamNamePlaceholder': 'e.g. Frontend Team',
        'room.roomCode': 'Room Code',
        'room.password': 'Password',
        'room.copyBtn': '📋 Copy Room Info',
        'room.copied': '✅ Copied',
        'room.generateBtn': 'Generate Room',
        'room.enterBtn': 'Enter Room',
        'room.roomCodePlaceholder': 'Enter room code',
        'room.passwordPlaceholder': 'Enter password',
        'room.joinBtn': 'Join Room',
        'room.errorName': 'Please enter a team name',
        'room.errorFields': 'Please fill in room code and password',
        'room.joinFailed': 'Failed to join room',
        'room.copyText': 'Your team is using Cursor Share to share quota. Here is the room info:\nServer Address: {serverUrl}\nRoom Code: {roomId}\nPassword: {password}\nPlease do not share with others. For internal team use only.',

        // ─── Room Switch ────────────────────────────────
        'room.switch.title': 'Cursor Share — Switch Room',
        'room.switch.message': 'Confirm leaving the current room?',
        'room.switch.detail': 'You will be disconnected and returned to the room selection screen.',
        'room.switch.confirm': 'Confirm Switch',

        // ─── Main App ───────────────────────────────────
        'app.connected': 'Connected',
        'app.disconnected': 'Disconnected',
        'app.switchBtn': 'Switch',
        'app.currentAccount': '👤 Current Account',
        'app.loading': 'Loading...',
        'app.unknownUser': 'Unknown',
        'app.cursorNotDetected': '(Cursor not detected)',
        'app.borrowingBadge': '🔗 Using {name}\'s quota',
        'app.borrowed': '(archived)',
        'app.cursorQuota': '✨ Cursor Quota',
        'app.refreshQuota': 'Refresh Quota',
        'app.teamOnline': '👥 Team Online',
        'app.waitingServer': 'Waiting for server connection...',
        'app.noMembers': 'No other online members',
        'app.forceKickBtn': '💥 Force Kick',
        'app.forceKickTitle': 'Refresh Token, force kick all borrowers',
        'app.restoreBtn': '🚪 Restore My Account',
        'app.restoreTitle': 'Restore local account, end borrowing',

        // ─── Team List ──────────────────────────────────
        'team.remaining': 'Remaining: {quota}',
        'team.sharing': 'Sharing: {count} user(s)',
        'team.borrowing': '🔗 Borrowing',
        'team.requestLabel': 'Requesting to borrow your quota',
        'team.approveBtn': 'Approve',
        'team.rejectBtn': 'Reject',
        'team.borrowBtn': 'Borrow',

        // ─── Toasts & Notifications ─────────────────────
        'toast.keygenFail': 'Key generation failed',
        'toast.requestSent': 'Borrow request sent, waiting for approval...',
        'toast.credsFail': 'Failed to read credentials',
        'toast.encryptFail': 'Encryption failed: {error}',
        'toast.approved': 'Approved {email}\'s borrow request',
        'toast.rejected': 'Rejected {email}\'s request',
        'toast.keyLost': 'Key lost, cannot decrypt',
        'toast.decryptFail': 'Token decryption failed',
        'toast.writeFail': 'Failed to write Token: {error}',
        'toast.restartingCursor': 'Restarting Cursor...',
        'toast.requestFailed': 'Request failed: {reason}',
        'toast.refreshFail': 'Token refresh failed: {error}',
        'toast.restoreFail': 'Restore failed: {error}',

        // ─── Dialogs ────────────────────────────────────
        'dialog.borrowApproved.message': '{email} has approved your quota borrow',
        'dialog.borrowApproved.detail': 'Restart Cursor client to activate. Use it wisely 🙏',
        'dialog.borrowApproved.restart': 'Restart Cursor Now',
        'dialog.borrowApproved.later': 'Restart Later',
        'dialog.borrowSuccess.message': 'Borrow successful 🎉',
        'dialog.borrowSuccess.detail': 'You are using {email}\'s Cursor quota. Use it wisely 🙏',

        'dialog.kicked.title': 'Cursor Share — Quota Revoked',
        'dialog.kicked.message': '{email} has revoked the shared quota',
        'dialog.kicked.detail': 'Your original account has been auto-restored. Restart Cursor client to switch back to your own account.',

        'dialog.revoke.title': 'Cursor Share — Force Kick',
        'dialog.revoke.message': 'Confirm refreshing Token and kicking all borrowers?',
        'dialog.revoke.detail': 'This will call Cursor servers to refresh the Token. The old Token will be invalidated immediately. Borrowers will no longer be able to use your quota.',
        'dialog.revoke.confirm': 'Confirm Kick',
        'dialog.revoke.success': 'Force kick successful ✅',
        'dialog.revoke.successDetail': 'Token has been refreshed on Cursor servers. The old Token is now invalid. Restart Cursor to use the new Token.',

        'dialog.restore.usingOwn': 'You are using your own account',
        'dialog.restore.usingOwnDetail': 'No borrow record found. No need to restore.',
        'dialog.restore.title': 'Cursor Share — Restore Account',
        'dialog.restore.message': 'Confirm restoring your own account?',
        'dialog.restore.detail': 'This will end the current borrow and return the other party\'s quota.',
        'dialog.restore.confirm': 'Confirm Restore',
        'dialog.restore.success': 'Account restored',
        'dialog.restore.successDetail': 'Your original Token has been written back. Restart Cursor client for it to take effect.',
        'dialog.restore.successOffline': 'Account restored ✅',
        'dialog.restore.successOfflineDetail': 'Your original Token has been written back. Next time you launch Cursor, it will use your own account.',

        'dialog.restartCursor': 'Restart Cursor Now',
        'dialog.restartLater': 'Restart Later',

        // ─── Notifications ──────────────────────────────
        'notify.borrowRequest': '{email} is requesting to borrow your quota',
        'notify.borrowRejected': '{email} rejected your borrow request',
        'notify.borrowerActivated': '{email} has activated your shared quota',
        'notify.borrowerReturned': '{email} has returned your quota',
        'notify.donorOffline': '{email} is offline, but the borrow is still active',
        'notify.borrowerOffline': '{email} is offline',

        // ─── Backend Messages (sent by server) ──────────
        'server.missingParams': 'Missing required parameters (id, email, roomId, password)',
        'server.wrongPassword': 'Wrong room password',
        'server.targetOffline': 'Target user is not online',
        'server.notSameRoom': 'Target user is not in the same room',
        'server.defaultReject': 'The other party rejected your request',
    },

    zh: {
        // ─── Tray Menu ──────────────────────────────────
        'tray.tooltip': 'Cursor Share',
        'tray.open': 'Cursor Share',
        'tray.forceKick': '强制踢出（刷新 Token）',
        'tray.forceKick.title': 'Cursor Share — 强制踢出',
        'tray.forceKick.message': '确认要刷新 Token 并踢出所有借用者？',
        'tray.forceKick.detail': '将调用 Cursor 服务器刷新 Token，旧 Token 立即失效。',
        'tray.forceKick.confirm': '确认踢出',
        'tray.forceKick.cancel': '取消',
        'tray.forceKick.success': '强制踢出成功 ✅',
        'tray.forceKick.successDetail': 'Token 已刷新，旧 Token 在 Cursor 服务器端已失效。重启 Cursor 后使用新 Token。',
        'tray.forceKick.ok': '我知道了',
        'tray.forceKick.failTitle': 'Cursor Share',
        'tray.forceKick.failMessage': '强制踢出失败',
        'tray.forceKick.failOk': '确定',
        'tray.restore': '恢复本账号',
        'tray.restore.noBorrow': '当前没有借用记录',
        'tray.restore.noBorrowDetail': '你正在使用自己的账号，无需恢复。',
        'tray.restore.title': 'Cursor Share — 恢复账号',
        'tray.restore.message': '确认要恢复自己的账号？',
        'tray.restore.detail': '这将恢复你的原始 Token，之前分发的 Token 将失效。',
        'tray.restore.confirm': '确认恢复',
        'tray.restore.success': '账号已恢复 ✅',
        'tray.restore.successDetail': '你的原始 Token 已写回，重启 Cursor 后生效。',
        'tray.restore.failMessage': '恢复失败',
        'tray.autoStart': '开机自启动',
        'tray.about': '关于',
        'tray.about.title': '关于 Cursor Share',
        'tray.about.message': 'Cursor Share v1.0',
        'tray.about.detail': '团队 Cursor 额度共享工具\n\n让团队成员之间安全地共享 Cursor AI 额度。',
        'tray.quit': '退出 Cursor Share',
        'dialog.ok': '确定',

        // ─── Room Screen ────────────────────────────────
        'room.subtitle': '选择一个方式加入团队',
        'room.serverLabel': '服务器地址',
        'room.tabCreate': '创建房间',
        'room.tabJoin': '加入房间',
        'room.teamName': '团队名称',
        'room.teamNamePlaceholder': '例如：前端组',
        'room.roomCode': '房间码',
        'room.password': '密码',
        'room.copyBtn': '📋 一键复制房间信息',
        'room.copied': '✅ 已复制',
        'room.generateBtn': '生成房间',
        'room.enterBtn': '进入房间',
        'room.roomCodePlaceholder': '输入房间码',
        'room.passwordPlaceholder': '输入密码',
        'room.joinBtn': '加入房间',
        'room.errorName': '请输入团队名称',
        'room.errorFields': '请填写房间码和密码',
        'room.joinFailed': '加入房间失败',
        'room.copyText': '您的团队正在使用 Cursor Share 共享额度，以下是房间信息：\n服务器地址：{serverUrl}\n房间码：{roomId}\n密码：{password}\n请不要随意分享给别人，仅供团队内部使用',

        // ─── Room Switch ────────────────────────────────
        'room.switch.title': 'Cursor Share — 切换房间',
        'room.switch.message': '确认要离开当前房间？',
        'room.switch.detail': '你将断开连接并返回房间选择界面。',
        'room.switch.confirm': '确认切换',

        // ─── Main App ───────────────────────────────────
        'app.connected': '已连接',
        'app.disconnected': '未连接',
        'app.switchBtn': '切换',
        'app.currentAccount': '👤 当前账号',
        'app.loading': '加载中...',
        'app.unknownUser': '未知',
        'app.cursorNotDetected': '(未检测到 Cursor)',
        'app.borrowingBadge': '🔗 正在使用 {name} 的额度',
        'app.borrowed': '(已存档)',
        'app.cursorQuota': '✨ Cursor 额度',
        'app.refreshQuota': '刷新额度',
        'app.teamOnline': '👥 团队在线',
        'app.waitingServer': '等待连接服务器...',
        'app.noMembers': '暂无其他在线成员',
        'app.forceKickBtn': '💥 强制踢出',
        'app.forceKickTitle': '刷新Token，强制踢出所有借用者',
        'app.restoreBtn': '🚪 恢复本账号',
        'app.restoreTitle': '恢复本地账号，结束借用',

        // ─── Team List ──────────────────────────────────
        'team.remaining': '剩余: {quota}',
        'team.sharing': '共享中: {count}人',
        'team.borrowing': '🔗 借用中',
        'team.requestLabel': '申请借用你的额度',
        'team.approveBtn': '同意',
        'team.rejectBtn': '拒绝',
        'team.borrowBtn': '申请',

        // ─── Toasts & Notifications ─────────────────────
        'toast.keygenFail': '密钥生成失败',
        'toast.requestSent': '借用请求已发送，等待对方确认...',
        'toast.credsFail': '读取凭证失败',
        'toast.encryptFail': '加密失败: {error}',
        'toast.approved': '已同意 {email} 的借用请求',
        'toast.rejected': '已拒绝 {email} 的请求',
        'toast.keyLost': '密钥丢失，无法解密',
        'toast.decryptFail': 'Token 解密失败',
        'toast.writeFail': '写入 Token 失败: {error}',
        'toast.restartingCursor': '正在重启 Cursor...',
        'toast.requestFailed': '请求失败: {reason}',
        'toast.refreshFail': 'Token 刷新失败: {error}',
        'toast.restoreFail': '恢复失败: {error}',

        // ─── Dialogs ────────────────────────────────────
        'dialog.borrowApproved.message': '{email} 已同意你的额度借用',
        'dialog.borrowApproved.detail': '重启 Cursor 客户端会自动生效，且行且珍惜 🙏',
        'dialog.borrowApproved.restart': '立即重启 Cursor',
        'dialog.borrowApproved.later': '稍后重启',
        'dialog.borrowSuccess.message': '借用额度成功 🎉',
        'dialog.borrowSuccess.detail': '你正在使用 {email} 的 Cursor 额度，且行且珍惜 🙏',

        'dialog.kicked.title': 'Cursor Share — 额度被收回',
        'dialog.kicked.message': '{email} 已收回共享额度',
        'dialog.kicked.detail': '你的原始账号已自动恢复。需要重启 Cursor 客户端以切换回自己的账号。',

        'dialog.revoke.title': 'Cursor Share — 强制踢出',
        'dialog.revoke.message': '确认要刷新 Token 并踢出所有借用者？',
        'dialog.revoke.detail': '将调用 Cursor 服务器刷新 Token，旧 Token 立即失效。借用者将无法继续使用你的额度。',
        'dialog.revoke.confirm': '确认踢出',
        'dialog.revoke.success': '强制踢出成功 ✅',
        'dialog.revoke.successDetail': 'Token 已在 Cursor 服务器端刷新，旧 Token 已失效。重启 Cursor 后使用新 Token。',

        'dialog.restore.usingOwn': '你正在使用自己的账号',
        'dialog.restore.usingOwnDetail': '当前没有借用记录，无需恢复。',
        'dialog.restore.title': 'Cursor Share — 恢复账号',
        'dialog.restore.message': '确认要恢复自己的账号？',
        'dialog.restore.detail': '这将结束当前的借用，归还对方的额度。',
        'dialog.restore.confirm': '确认恢复',
        'dialog.restore.success': '账号已恢复',
        'dialog.restore.successDetail': '你的原始 Token 已写回。重启 Cursor 客户端后生效。',
        'dialog.restore.successOffline': '账号已恢复 ✅',
        'dialog.restore.successOfflineDetail': '你的原始 Token 已写回，下次启动 Cursor 将使用自己的账号。',

        'dialog.restartCursor': '立即重启 Cursor',
        'dialog.restartLater': '稍后重启',

        // ─── Notifications ──────────────────────────────
        'notify.borrowRequest': '{email} 申请借用你的额度',
        'notify.borrowRejected': '{email} 拒绝了你的借用请求',
        'notify.borrowerActivated': '{email} 已成功激活你的共享额度',
        'notify.borrowerReturned': '{email} 已归还你的额度',
        'notify.donorOffline': '{email} 已离线，但借用仍有效',
        'notify.borrowerOffline': '{email} 已离线',

        // ─── Backend Messages (sent by server) ──────────
        'server.missingParams': '缺少必要参数 (id, email, roomId, password)',
        'server.wrongPassword': '房间密码错误',
        'server.targetOffline': '目标用户不在线',
        'server.notSameRoom': '目标用户不在同一房间',
        'server.defaultReject': '对方拒绝了你的请求',
    },
};

let currentLocale = 'en';

/**
 * Set the current locale.
 * @param {string} locale — 'en', 'zh', 'zh-CN', 'zh-TW', etc.
 */
function setLocale(locale) {
    // Normalize: 'zh-CN', 'zh-TW', 'zh-Hans' → 'zh'
    if (locale && locale.startsWith('zh')) {
        currentLocale = 'zh';
    } else {
        currentLocale = 'en';
    }
}

/**
 * Get the current locale key.
 * @returns {string} 'en' or 'zh'
 */
function getLocale() {
    return currentLocale;
}

/**
 * Translate a key with optional interpolation parameters.
 * @param {string} key — dot-separated key, e.g. 'tray.forceKick'
 * @param {Object} [params] — template values, e.g. { email: 'a@b.com' }
 * @returns {string}
 */
function t(key, params) {
    const dict = translations[currentLocale] || translations.en;
    let text = dict[key] || translations.en[key] || key;

    if (params) {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
    }

    return text;
}

// Support both CommonJS (main process / preload) and browser (renderer)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { t, setLocale, getLocale, translations };
}
