import { CryptoProxy, type SessionKey } from '@protontech/crypto';
import type { CachedCryptoMaterial, EntityResult, ProtonDriveCache } from '@protontech/drive-sdk';

const VERSION = 1;

type SerializedCachedCryptoMaterial = {
    v: typeof VERSION;
    nodeKeys?: {
        passphrase: string;
        armoredPrivateKey: string;
        passphraseSessionKey: SerializedSessionKey;
        contentKeyPacketSessionKey?: SerializedSessionKey;
        hashKeyBase64?: string;
    };
    shareKey?: {
        armoredPrivateKey: string;
        passphraseSessionKey: SerializedSessionKey;
    };
    publicShareKey?: {
        armoredPrivateKey: string;
    };
};

type SerializedSessionKey = {
    dataBase64: string;
    algorithm: number;
    aeadAlgorithm?: number;
};

/**
 * Adapter converting a CachedCryptoMaterial to string and back by serialising
 * crypto objects to JSON (armored keys, base64 session key material). Values
 * are not encrypted because the underlying cache should handle the encryption
 * of the whole value.
 */
export class DriveCryptoCacheAdapter implements ProtonDriveCache<CachedCryptoMaterial> {
    constructor(private readonly cache: ProtonDriveCache<string>) {}

    async setEntity(key: string, value: CachedCryptoMaterial, tags?: string[]): Promise<void> {
        await this.cache.setEntity(key, await serializeCachedCryptoMaterial(value), tags);
    }

    async getEntity(key: string): Promise<CachedCryptoMaterial> {
        return deserializeCachedCryptoMaterial(await this.cache.getEntity(key));
    }

    async *iterateEntities(keys: string[]): AsyncGenerator<EntityResult<CachedCryptoMaterial>> {
        for await (const result of this.cache.iterateEntities(keys)) {
            yield await this.convertResult(result);
        }
    }

    async *iterateEntitiesByTag(tag: string): AsyncGenerator<EntityResult<CachedCryptoMaterial>> {
        for await (const result of this.cache.iterateEntitiesByTag(tag)) {
            yield await this.convertResult(result);
        }
    }

    private async convertResult(result: EntityResult<string>): Promise<EntityResult<CachedCryptoMaterial>> {
        if (!result.ok) {
            return result;
        }
        try {
            return {
                key: result.key,
                ok: true,
                value: await deserializeCachedCryptoMaterial(result.value),
            };
        } catch (error: unknown) {
            return {
                key: result.key,
                ok: false,
                error: error instanceof Error ? error.message : `${error}`,
            };
        }
    }

    async clear(): Promise<void> {
        return this.cache.clear();
    }

    async removeEntities(keys: string[]): Promise<void> {
        return this.cache.removeEntities(keys);
    }
}

async function serializeCachedCryptoMaterial(value: CachedCryptoMaterial): Promise<string> {
    const output: SerializedCachedCryptoMaterial = { v: VERSION };

    if (value.nodeKeys) {
        const nk = value.nodeKeys;
        output.nodeKeys = {
            passphrase: nk.passphrase,
            armoredPrivateKey: await CryptoProxy.exportPrivateKey({
                privateKey: nk.key,
                passphrase: null,
            }),
            passphraseSessionKey: serializeSessionKey(nk.passphraseSessionKey),
            ...(nk.contentKeyPacketSessionKey
                ? { contentKeyPacketSessionKey: serializeSessionKey(nk.contentKeyPacketSessionKey) }
                : {}),
            ...(nk.hashKey ? { hashKeyBase64: Buffer.from(nk.hashKey).toString('base64') } : {}),
        };
    }

    if (value.shareKey) {
        const sk = value.shareKey;
        output.shareKey = {
            armoredPrivateKey: await CryptoProxy.exportPrivateKey({
                privateKey: sk.key,
                passphrase: null,
            }),
            passphraseSessionKey: serializeSessionKey(sk.passphraseSessionKey),
        };
    }

    if (value.publicShareKey) {
        const psk = value.publicShareKey;
        output.publicShareKey = {
            armoredPrivateKey: await CryptoProxy.exportPrivateKey({
                privateKey: psk.key,
                passphrase: null,
            }),
        };
    }

    return JSON.stringify(output);
}

async function deserializeCachedCryptoMaterial(json: string): Promise<CachedCryptoMaterial> {
    const output = JSON.parse(json) as SerializedCachedCryptoMaterial;
    if (output.v !== VERSION) {
        throw new Error(`Unsupported crypto cache version: ${output.v}`);
    }

    const value: CachedCryptoMaterial = {};

    if (output.nodeKeys) {
        const nk = output.nodeKeys;
        value.nodeKeys = {
            passphrase: nk.passphrase,
            key: await CryptoProxy.importPrivateKey({
                armoredKey: nk.armoredPrivateKey,
                passphrase: null,
            }),
            passphraseSessionKey: deserializeSessionKey(nk.passphraseSessionKey),
            ...(nk.contentKeyPacketSessionKey
                ? { contentKeyPacketSessionKey: deserializeSessionKey(nk.contentKeyPacketSessionKey) }
                : {}),
            ...(nk.hashKeyBase64 ? { hashKey: new Uint8Array(Buffer.from(nk.hashKeyBase64, 'base64')) } : {}),
        };
    }

    if (output.shareKey) {
        const sk = output.shareKey;
        value.shareKey = {
            key: await CryptoProxy.importPrivateKey({
                armoredKey: sk.armoredPrivateKey,
                passphrase: null,
            }),
            passphraseSessionKey: deserializeSessionKey(sk.passphraseSessionKey),
        };
    }

    if (output.publicShareKey) {
        const psk = output.publicShareKey;
        value.publicShareKey = {
            key: await CryptoProxy.importPrivateKey({
                armoredKey: psk.armoredPrivateKey,
                passphrase: null,
            }),
        };
    }

    return value;
}

function serializeSessionKey(sk: SessionKey): SerializedSessionKey {
    const output: SerializedSessionKey = {
        dataBase64: Buffer.from(sk.data).toString('base64'),
        algorithm: sk.algorithm as unknown as number,
    };
    if (sk.aeadAlgorithm !== undefined) {
        output.aeadAlgorithm = sk.aeadAlgorithm as unknown as number;
    }
    return output;
}

function deserializeSessionKey(json: SerializedSessionKey): SessionKey {
    const output: SessionKey = {
        data: new Uint8Array(Buffer.from(json.dataBase64, 'base64')),
        algorithm: json.algorithm as unknown as SessionKey['algorithm'],
    };
    if (json.aeadAlgorithm !== undefined) {
        output.aeadAlgorithm = json.aeadAlgorithm as unknown as NonNullable<SessionKey['aeadAlgorithm']>;
    }
    return output;
}
