/**
 * sqlite-ops.js — Read/write Cursor's local SQLite database (state.vscdb)
 *
 * Uses better-sqlite3 for synchronous, fast access.
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Cross-platform: resolve Cursor's data directory
function getCursorDataDir() {
    switch (process.platform) {
        case 'win32':
            return path.join(process.env.APPDATA, 'Cursor', 'User', 'globalStorage');
        case 'darwin':
            return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage');
        default: // linux
            return path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage');
    }
}

const CURSOR_DATA_DIR = getCursorDataDir();
const DB_PATH = path.join(CURSOR_DATA_DIR, 'state.vscdb');
const BACKUP_PATH = path.join(CURSOR_DATA_DIR, '.cursor_share_backup.json');

const KEYS = {
    accessToken: 'cursorAuth/accessToken',
    refreshToken: 'cursorAuth/refreshToken',
    email: 'cursorAuth/cachedEmail',
    membership: 'cursorAuth/stripeMembershipType',
    signUpType: 'cursorAuth/cachedSignUpType',
};

/**
 * Read all Cursor auth credentials from local SQLite.
 * Includes detailed diagnostics for troubleshooting.
 */
function readCredentials() {
    console.log('[SQLite] DB path:', DB_PATH);

    // Pre-flight: check if file exists
    if (!fs.existsSync(DB_PATH)) {
        const parentDir = path.dirname(DB_PATH);
        const parentExists = fs.existsSync(parentDir);
        throw new Error(
            `Cursor 数据库文件不存在: ${DB_PATH}\n` +
            `目录 ${parentDir} ${parentExists ? '存在' : '也不存在'}\n` +
            '请确认：1) Cursor 已安装 2) 已登录过 Cursor 账号'
        );
    }

    let db;
    try {
        db = new Database(DB_PATH, { readonly: true });
    } catch (e) {
        throw new Error(
            `无法打开 SQLite 数据库: ${e.message}\n` +
            '可能是 better-sqlite3 原生模块不兼容，请运行:\n' +
            'npm install && npx -y @electron/rebuild'
        );
    }

    try {
        const stmt = db.prepare(
            `SELECT key, value FROM itemTable WHERE key IN (${Object.values(KEYS).map(() => '?').join(',')})`
        );
        const rows = stmt.all(...Object.values(KEYS));

        console.log(`[SQLite] Found ${rows.length} credential entries`);

        if (rows.length === 0) {
            throw new Error(
                'Cursor 数据库中无登录凭证。请确认已登录 Cursor 账号。'
            );
        }

        const result = {};
        for (const row of rows) {
            const shortKey = Object.entries(KEYS).find(([, v]) => v === row.key)?.[0];
            if (shortKey) result[shortKey] = row.value;
        }

        // Parse JWT to get userId (sub)
        if (result.accessToken) {
            try {
                const payload = JSON.parse(
                    Buffer.from(result.accessToken.split('.')[1], 'base64').toString('utf8')
                );
                result.userId = payload.sub;
                console.log('[SQLite] User ID:', result.userId);
                console.log('[SQLite] Email:', result.email);
            } catch (e) {
                console.error('[SQLite] Failed to parse JWT:', e);
            }
        }

        return result;
    } finally {
        db.close();
    }
}

/**
 * Backup current credentials before overwriting with borrowed token.
 */
function backupCredentials() {
    const creds = readCredentials();
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(creds, null, 2), 'utf8');
    console.log('[Backup] Credentials backed up to', BACKUP_PATH);
    return creds;
}

/**
 * Write borrowed token into Cursor's local SQLite.
 * IMPORTANT: Cursor should be closed or it may overwrite on next launch.
 */
function writeToken(accessToken, refreshToken) {
    const db = new Database(DB_PATH);
    try {
        const update = db.prepare(
            `INSERT OR REPLACE INTO itemTable (key, value) VALUES (?, ?)`
        );

        const transaction = db.transaction(() => {
            update.run(KEYS.accessToken, accessToken);
            if (refreshToken) {
                update.run(KEYS.refreshToken, refreshToken);
            }
        });

        transaction();
        console.log('[SQLite] Token written successfully');
    } finally {
        db.close();
    }
}

/**
 * Restore original credentials from backup file.
 */
function restoreBackup() {
    if (!fs.existsSync(BACKUP_PATH)) {
        throw new Error('No backup file found. Cannot restore.');
    }

    const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
    writeToken(backup.accessToken, backup.refreshToken);

    // Clean up backup file
    fs.unlinkSync(BACKUP_PATH);
    console.log('[Restore] Credentials restored from backup');
    return backup;
}

/**
 * Check if a backup exists (meaning we are currently borrowing).
 */
function hasBackup() {
    return fs.existsSync(BACKUP_PATH);
}

/**
 * Refresh the access token via Cursor's API, then write the new token to SQLite.
 * This invalidates the old access token on Cursor's servers,
 * making any previously shared tokens useless.
 * @returns {Promise<object>} { ok: boolean, newAccessToken?: string, error?: string }
 */
async function refreshAndWriteToken() {
    const { refreshAccessToken } = require('./cursor-api');

    // 1. Read current refreshToken from SQLite
    const creds = readCredentials();
    if (!creds.refreshToken) {
        throw new Error('本地数据库中没有 refreshToken');
    }

    console.log('[RefreshToken] Calling Cursor refresh API...');

    // 2. Call Cursor's refresh API
    const result = await refreshAccessToken(creds.refreshToken);
    console.log('[RefreshToken] Got new accessToken');

    // 3. Write new accessToken to SQLite
    writeToken(result.accessToken, creds.refreshToken);
    console.log('[RefreshToken] New token written to SQLite');

    return { ok: true, newAccessToken: result.accessToken };
}

module.exports = {
    readCredentials,
    backupCredentials,
    writeToken,
    restoreBackup,
    hasBackup,
    refreshAndWriteToken,
    DB_PATH,
    BACKUP_PATH,
};
