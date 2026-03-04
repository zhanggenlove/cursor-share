/**
 * cursor-api.js — Fetch usage quota from Cursor's API
 */

const https = require('https');

/**
 * Fetch the usage quota for a given user.
 * @param {string} userId - e.g. "auth0|user_01KGKCF2D03CBBXE3A6EMQT3HX"
 * @param {string} accessToken - JWT access token
 * @returns {Promise<object>} usage data
 */
function fetchUsage(userId, accessToken) {
    return new Promise((resolve, reject) => {
        // Build the cookie string that Cursor's API expects
        const userIdShort = userId.replace('auth0|', '');
        const cookieString = `WorkosCursorSessionToken=${userIdShort}::${accessToken}`;

        const options = {
            hostname: 'cursor.com',
            path: `/api/usage?user=${encodeURIComponent(userIdShort)}`,
            method: 'GET',
            headers: {
                'Cookie': cookieString,
                'Accept': 'application/json',
            },
        };

        const req = https.request(options, (res) => {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const data = JSON.parse(rawData);
                        // Normalize the response into a simpler format
                        const result = {
                            startOfMonth: data.startOfMonth,
                            models: {},
                        };

                        for (const [model, info] of Object.entries(data)) {
                            if (model === 'startOfMonth') continue;
                            result.models[model] = {
                                used: info.numRequests || 0,
                                max: info.maxRequestUsage || null,
                                remaining: info.maxRequestUsage
                                    ? info.maxRequestUsage - (info.numRequests || 0)
                                    : null,
                            };
                        }

                        resolve(result);
                    } catch (e) {
                        reject(new Error(`Failed to parse API response: ${e.message}`));
                    }
                } else {
                    reject(new Error(`API returned status ${res.statusCode}: ${rawData}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.end();
    });
}

/**
 * Refresh the access token using the refresh token.
 * This invalidates the old access token on Cursor's servers.
 * @param {string} refreshToken - The refresh token JWT
 * @returns {Promise<object>} { accessToken: string }
 */
function refreshAccessToken(refreshToken) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });

        const options = {
            hostname: 'api2.cursor.sh',
            path: '/oauth/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(options, (res) => {
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const data = JSON.parse(rawData);
                        if (data.access_token) {
                            resolve({ accessToken: data.access_token });
                        } else {
                            reject(new Error('Refresh response missing access_token'));
                        }
                    } catch (e) {
                        reject(new Error(`Failed to parse refresh response: ${e.message}`));
                    }
                } else {
                    reject(new Error(`Refresh API returned status ${res.statusCode}: ${rawData}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

module.exports = { fetchUsage, refreshAccessToken };
