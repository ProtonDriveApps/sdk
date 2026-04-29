import '@protontech/drive-sdk/polyfill';

import { CryptoProxy, type SessionKey } from '@protontech/crypto';
import { Api as CryptoApi } from '@protontech/crypto/proxy/endpoint/api.ts';
import { type CachedCryptoMaterial, MemoryCache } from '@protontech/drive-sdk';

import { DriveCryptoCacheAdapter } from './driveCryptoCacheAdapter';

type CachedPrivateKey = NonNullable<CachedCryptoMaterial['nodeKeys']>['key'];

describe('DriveCryptoCacheAdapter', () => {
    let cryptoApi: CryptoApi;
    let inner: MemoryCache<string>;
    let adapter: DriveCryptoCacheAdapter;

    beforeAll(() => {
        CryptoApi.init({});
        cryptoApi = new CryptoApi();
        CryptoProxy.setEndpoint(cryptoApi, async (endpoint) => endpoint.clearKeyStore());
    });

    afterAll(async () => {
        await CryptoProxy.releaseEndpoint();
    });

    beforeEach(() => {
        inner = new MemoryCache<string>();
        adapter = new DriveCryptoCacheAdapter(inner);
    });

    it('round-trips empty material', async () => {
        const value: CachedCryptoMaterial = {};
        await adapter.setEntity('k', value);
        const out = await adapter.getEntity('k');
        expect(out).toEqual({});
    });

    it('round-trips nodeKeys with optional contentKeyPacketSessionKey and hashKey', async () => {
        const key = await generatePrivateKey();
        const passphraseSessionKey = await generateSessionKey(key);
        const contentKeyPacketSessionKey = await generateSessionKey(key);
        const hashKey = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));

        const value: CachedCryptoMaterial = {
            nodeKeys: {
                passphrase: 'node-pass',
                key,
                passphraseSessionKey,
                contentKeyPacketSessionKey,
                hashKey,
            },
        };

        await adapter.setEntity('node', value);
        const out = await adapter.getEntity('node');

        expect(out.nodeKeys?.passphrase).toBe('node-pass');
        await expectSamePrivateKeys(value.nodeKeys!.key, out.nodeKeys!.key);
        expectSameSessionKeys(passphraseSessionKey, out.nodeKeys!.passphraseSessionKey);
        expectSameSessionKeys(contentKeyPacketSessionKey, out.nodeKeys!.contentKeyPacketSessionKey!);
        expect(Buffer.from(out.nodeKeys!.hashKey!).equals(Buffer.from(hashKey))).toBe(true);
    });

    it('round-trips shareKey and publicShareKey', async () => {
        const sharePrivate = await generatePrivateKey();
        const publicPrivate = await generatePrivateKey();
        const passphraseSessionKey = await generateSessionKey(sharePrivate);

        const value: CachedCryptoMaterial = {
            shareKey: {
                key: sharePrivate,
                passphraseSessionKey,
            },
            publicShareKey: {
                key: publicPrivate,
            },
        };

        await adapter.setEntity('share', value);
        const out = await adapter.getEntity('share');

        await expectSamePrivateKeys(sharePrivate, out.shareKey!.key);
        expectSameSessionKeys(passphraseSessionKey, out.shareKey!.passphraseSessionKey);
        await expectSamePrivateKeys(publicPrivate, out.publicShareKey!.key);
    });

    it('passes tags to the inner cache', async () => {
        await adapter.setEntity('tagged', {}, ['parent:x']);
        await expect(inner.getEntity('tagged')).resolves.toBeTruthy();
        const results = await Array.fromAsync(inner.iterateEntitiesByTag('parent:x'));
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ key: 'tagged', ok: true });
    });

    it('delegates clear and removeEntities', async () => {
        await adapter.setEntity('a', {});
        await adapter.clear();
        await expect(inner.getEntity('a')).rejects.toThrow('Entity not found');

        await adapter.setEntity('b', {});
        await adapter.removeEntities(['b']);
        await expect(inner.getEntity('b')).rejects.toThrow('Entity not found');
    });

    it('iterateEntities forwards inner errors without deserializing', async () => {
        const results = await Array.fromAsync(adapter.iterateEntities(['missing']));
        expect(results).toEqual([
            {
                key: 'missing',
                ok: false,
                error: 'Error: Entity not found',
            },
        ]);
    });

    it('iterateEntities yields deserialized values', async () => {
        const key = await generatePrivateKey();
        const sk = await generateSessionKey(key);
        await adapter.setEntity('one', {
            nodeKeys: {
                passphrase: 'p',
                key,
                passphraseSessionKey: sk,
            },
        });

        const results = await Array.fromAsync(adapter.iterateEntities(['one']));
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ key: 'one', ok: true });
        const ok = results[0] as { ok: true; value: CachedCryptoMaterial };
        await expectSamePrivateKeys(key, ok.value.nodeKeys!.key);
        expectSameSessionKeys(sk, ok.value.nodeKeys!.passphraseSessionKey);
    });

    it('iterateEntities maps deserialization failures to ok: false', async () => {
        await inner.setEntity('bad', 'not-valid-json');
        const results = await Array.fromAsync(adapter.iterateEntities(['bad']));
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ key: 'bad', ok: false });
    });

    it('iterateEntitiesByTag yields deserialized entries', async () => {
        const key = await generatePrivateKey();
        await adapter.setEntity('tagged-node', {
            nodeKeys: {
                passphrase: '',
                key,
                passphraseSessionKey: await generateSessionKey(key),
            },
        }, ['t:1']);

        const results = await Array.fromAsync(adapter.iterateEntitiesByTag('t:1'));
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ key: 'tagged-node', ok: true });
    });

    it('throws when cache version is unsupported', async () => {
        await inner.setEntity('old', '{"v":0}');
        await expect(adapter.getEntity('old')).rejects.toThrow('Unsupported crypto cache version');
    });
});

async function generatePrivateKey() {
    return CryptoProxy.generateKey({
        userIDs: [{ name: 'DriveCryptoCacheAdapter test' }],
        type: 'ecc',
        curve: 'ed25519Legacy',
    });
}

async function generateSessionKey(recipientPrivateKey: Awaited<ReturnType<typeof generatePrivateKey>>) {
    const publicKey = await CryptoProxy.importPublicKey({
        binaryKey: await CryptoProxy.exportPublicKey({ key: recipientPrivateKey, format: 'binary' }),
    });
    return CryptoProxy.generateSessionKey({ recipientKeys: publicKey });
}

async function expectSamePrivateKeys(a: CachedPrivateKey, b: CachedPrivateKey) {
    const [ea, eb] = await Promise.all([
        CryptoProxy.exportPrivateKey({ privateKey: a, passphrase: null }),
        CryptoProxy.exportPrivateKey({ privateKey: b, passphrase: null }),
    ]);
    expect(ea).toBe(eb);
}

function expectSameSessionKeys(a: SessionKey, b: SessionKey) {
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(a.algorithm).toBe(b.algorithm);
    expect(a.aeadAlgorithm).toBe(b.aeadAlgorithm);
}
