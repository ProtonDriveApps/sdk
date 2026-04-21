import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const CACHE_ENCRYPTION_CONTEXT = Buffer.from('Drive.EncryptedCacheRepository', 'utf8');
const IV_BYTE_COUNT = 12;
const SALT_BYTE_COUNT = 16;
const TAG_BYTE_COUNT = 16;
const KEY_BYTE_COUNT = 32;

export function encryptCacheValue(cacheKey: string, plaintext: string, ikm: Buffer): string {
    const plaintextBytes = Buffer.from(plaintext, 'utf8');
    const salt = randomBytes(SALT_BYTE_COUNT);
    const info = concatBuffers(CACHE_ENCRYPTION_CONTEXT, Buffer.from(cacheKey, 'utf8'));
    const derived = Buffer.from(hkdfSync('sha256', ikm, salt, info, KEY_BYTE_COUNT + IV_BYTE_COUNT));
    const aesKey = derived.subarray(0, KEY_BYTE_COUNT);
    const iv = derived.subarray(KEY_BYTE_COUNT);
    const cipher = createCipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_BYTE_COUNT });
    const ciphertext = Buffer.concat([cipher.update(plaintextBytes), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, ciphertext, tag]).toString('base64');
}

export function decryptCacheValue(cacheKey: string, encryptedBase64: string, ikm: Buffer): string {
    const combined = Buffer.from(encryptedBase64, 'base64');
    if (combined.length < SALT_BYTE_COUNT + TAG_BYTE_COUNT) {
        throw new Error('Invalid encrypted data format');
    }
    const salt = combined.subarray(0, SALT_BYTE_COUNT);
    const ciphertext = combined.subarray(SALT_BYTE_COUNT, combined.length - TAG_BYTE_COUNT);
    const tag = combined.subarray(combined.length - TAG_BYTE_COUNT);
    const info = concatBuffers(CACHE_ENCRYPTION_CONTEXT, Buffer.from(cacheKey, 'utf8'));
    const derived = Buffer.from(hkdfSync('sha256', ikm, salt, info, KEY_BYTE_COUNT + IV_BYTE_COUNT));
    const aesKey = derived.subarray(0, KEY_BYTE_COUNT);
    const iv = derived.subarray(KEY_BYTE_COUNT);
    const decipher = createDecipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_BYTE_COUNT });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function concatBuffers(a: Buffer, b: Buffer): Buffer {
    return Buffer.concat([a, b]);
}
