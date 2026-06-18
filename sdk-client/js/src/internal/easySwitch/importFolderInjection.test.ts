import { MemoryCache } from '../../cache';
import { OpenPGPCrypto, PrivateKey, SRPModule, VERIFICATION_STATUS } from '../../crypto';
import { CachedCryptoMaterial } from '../../interface';
import { getMockTelemetry } from '../../tests/telemetry';
import { NodesCryptoCache } from '../nodes/cryptoCache';
import { seedImportFolderCryptoCache } from './importFolderInjection';

describe('seedImportFolderCryptoCache', () => {
    const importFolderKey = 'importFolderKey' as unknown as PrivateKey;
    const hashKey = new Uint8Array([1, 2, 3]);

    let openPGPCryptoModule: OpenPGPCrypto;
    let srpModule: SRPModule;
    let cache: MemoryCache<CachedCryptoMaterial>;

    beforeEach(() => {
        openPGPCryptoModule = {
            decryptArmoredAndVerify: jest.fn(async () =>
                Promise.resolve({
                    data: hashKey,
                    verified: VERIFICATION_STATUS.SIGNED_AND_VALID,
                }),
            ),
        } as unknown as OpenPGPCrypto;
        srpModule = {} as SRPModule;
        cache = new MemoryCache<CachedCryptoMaterial>();
    });

    it('decrypts the hash key and seeds the crypto cache for the root node', async () => {
        await seedImportFolderCryptoCache({
            openPGPCryptoModule,
            srpModule,
            telemetry: getMockTelemetry(),
            cryptoCache: cache,
            importFolder: {
                nodeUid: 'volumeId~linkId',
                key: importFolderKey,
                passphrase: 'passphrase',
                armoredHashKey: 'armoredHashKey',
            },
        });

        // Hash key is decrypted with the import folder's own node key.
        expect(openPGPCryptoModule.decryptArmoredAndVerify).toHaveBeenCalledWith(
            'armoredHashKey',
            [importFolderKey],
            expect.arrayContaining([importFolderKey]),
        );

        const seeded = await new NodesCryptoCache(getMockTelemetry().mockLogger, cache).getNodeKeys('volumeId~linkId');
        expect(seeded.key).toBe(importFolderKey);
        expect(seeded.passphrase).toBe('passphrase');
        expect(seeded.hashKey).toEqual(hashKey);
    });

    it('produces keys readable without a passphrase session key', async () => {
        await seedImportFolderCryptoCache({
            openPGPCryptoModule,
            srpModule,
            telemetry: getMockTelemetry(),
            cryptoCache: cache,
            importFolder: {
                nodeUid: 'volumeId~linkId',
                key: importFolderKey,
                passphrase: 'passphrase',
                armoredHashKey: 'armoredHashKey',
            },
        });

        const seeded = await new NodesCryptoCache(getMockTelemetry().mockLogger, cache).getNodeKeys('volumeId~linkId');
        expect(seeded.passphraseSessionKey).toBeUndefined();
    });
});
