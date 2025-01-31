import { PrivateKey, SessionKey } from './interface';
import { uint8ArrayToBase64String, base64StringToUint8Array } from './utils';

export function serializePrivateKey(key: PrivateKey): string {
    return key.armor();
}

export function deserializePrivateKey(armoredKey: string): Promise<PrivateKey> {
    // TODO: Implement this with real pmcrypto/CryptoProxy.
    // Depeding on openpgp requires additional setup for tests, so we can't do it yet.
    // Maybe this will not be even needed if we solve serialising differently (probably we should).
    //import { readPrivateKey } from 'pmcrypto';
    //return readPrivateKey({ armoredKey });
    return Promise.resolve({
        armor: () => armoredKey,
    })
}

export function serializeSessionKey(key: SessionKey): string {
    return JSON.stringify({
        ...key,
        data: uint8ArrayToBase64String(key.data),
    });
}

export function deserializeSessionKey(jsonKey: string): SessionKey {
    const result = JSON.parse(jsonKey);
    const data = base64StringToUint8Array(result.data);
    return {
        data,
        algorithm: result.algorithm,
        aeadAlgorithm: result.aeadAlgorithm,
    }
}

export function serializeHashKey(key: Uint8Array): string {
    return uint8ArrayToBase64String(key);
}

export function deserializeHashKey(jsonKey: string): Uint8Array {
    return base64StringToUint8Array(jsonKey);
}
