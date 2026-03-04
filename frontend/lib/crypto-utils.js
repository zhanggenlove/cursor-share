/**
 * crypto-utils.js — Hybrid RSA+AES encryption for zero-trust token transfer
 *
 * Uses Node.js built-in crypto module.
 * - AES-256-GCM encrypts the actual data (no size limit)
 * - RSA-OAEP encrypts the 32-byte AES key (well within RSA limits)
 */

const crypto = require('crypto');

/**
 * Generate a new RSA 2048-bit key pair.
 * Returns { publicKey, privateKey } in PEM format.
 */
function generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey, privateKey };
}

/**
 * Hybrid encrypt: AES-256-GCM for data, RSA-OAEP for the AES key.
 * Returns a base64-encoded JSON envelope: { key, iv, tag, data }
 */
function encrypt(plaintext, publicKeyPem) {
    // 1. Generate random AES-256 key and IV
    const aesKey = crypto.randomBytes(32); // 256 bits
    const iv = crypto.randomBytes(12);     // 96-bit IV for GCM

    // 2. Encrypt data with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // 3. Encrypt the AES key with RSA-OAEP (32 bytes, well within limit)
    const encryptedKey = crypto.publicEncrypt(
        {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        aesKey
    );

    // 4. Pack into a JSON envelope, base64 encoded
    const envelope = {
        key: encryptedKey.toString('base64'),  // RSA-encrypted AES key
        iv: iv.toString('base64'),             // AES IV
        tag: authTag.toString('base64'),       // GCM auth tag
        data: encrypted.toString('base64'),    // AES-encrypted payload
    };

    return Buffer.from(JSON.stringify(envelope)).toString('base64');
}

/**
 * Hybrid decrypt: RSA-OAEP to recover AES key, then AES-256-GCM for data.
 */
function decrypt(ciphertext, privateKeyPem) {
    // 1. Unpack envelope
    const envelope = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8'));

    // 2. Decrypt AES key with RSA
    const aesKey = crypto.privateDecrypt(
        {
            key: privateKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        Buffer.from(envelope.key, 'base64')
    );

    // 3. Decrypt data with AES-256-GCM
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        aesKey,
        Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

module.exports = { generateKeyPair, encrypt, decrypt };
