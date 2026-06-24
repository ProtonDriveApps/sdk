import { createDecipheriv, randomBytes } from 'node:crypto';

const PROTON_ACCOUNT_URL = 'https://account.proton.me';
const FORK_AAD = Buffer.from('fork', 'utf8');
const GCM_NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

export const FORK_POLL_INTERVAL_MS = 5000;
export const FORK_INITIAL_DELAY_MS = 5000;
export const FORK_MAX_POLL_TIME_MS = 10 * 60 * 1000; // 10 minutes

type ForkPayloadJson = {
    type?: string;
    keyPassword?: string;
};

export function generateSignInUrl(
    authClientId: string,
    userCode: string,
): {
    encryptionKey: Buffer;
    signInUrl: string;
} {
    const encryptionKey = randomBytes(32);
    const base64EncodedKey = encryptionKey.toString('base64');
    const payload = `0:${userCode}:${base64EncodedKey}:${authClientId}`;
    const signInUrl = `${PROTON_ACCOUNT_URL}/desktop/login?app=drive&pv=3#payload=${encodeURIComponent(payload)}`;

    return {
        encryptionKey,
        signInUrl,
    };
}

export function parseUserKeyPassword(encryptionKey: Buffer, encryptedPayload: string): string {
    const decryptedPayload = decryptForkPayload(encryptedPayload, encryptionKey);
    const userKeyPassword = parseForkUserKeyPassword(decryptedPayload);
    return userKeyPassword;
}

function decryptForkPayload(encodedPayload: string, encryptionKey: Buffer): string {
    const blob = Buffer.from(encodedPayload, 'base64');
    if (blob.length < GCM_NONCE_LENGTH + GCM_TAG_LENGTH) {
        throw new Error('Invalid fork payload blob length');
    }
    const nonce = blob.subarray(0, GCM_NONCE_LENGTH);
    const tag = blob.subarray(blob.length - GCM_TAG_LENGTH);
    const ciphertext = blob.subarray(GCM_NONCE_LENGTH, blob.length - GCM_TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, nonce);
    decipher.setAuthTag(tag);
    decipher.setAAD(FORK_AAD);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function parseForkUserKeyPassword(decryptedPayloadJson: string): string {
    const payload = JSON.parse(decryptedPayloadJson) as ForkPayloadJson;
    const keyPassword = payload.keyPassword;
    if (typeof keyPassword !== 'string') {
        throw new Error('Failed to deserialize the fork payload');
    }
    return keyPassword;
}
