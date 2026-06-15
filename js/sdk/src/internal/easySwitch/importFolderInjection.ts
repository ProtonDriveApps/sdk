import { DriveCrypto, OpenPGPCrypto, PrivateKey, SessionKey, SRPModule } from '../../crypto';
import { ProtonDriveCryptoCache, ProtonDriveTelemetry } from '../../interface';
import { Telemetry } from '../../telemetry';
import { NodesCryptoCache } from '../nodes/cryptoCache';

/**
 * Seeds the crypto cache with the already-decrypted keys of an import folder so
 * it can be used as the root of a `ProtonDrivePublicLinkClient` without going
 * through node decryption.
 *
 * Easy Switch imports files into an orphaned "import folder" using an anonymous
 * session. It holds the folder's decrypted node key and clear passphrase, but
 * not the key the folder's passphrase is encrypted to (the real parent/volume
 * key), so the SDK cannot derive the folder's key from its passphrase. Instead,
 * the caller provides the decrypted key directly and the folder's armored hash
 * key (forwarded from the import payload); this decrypts the hash key with the
 * node key and writes the complete keys into the crypto cache.
 *
 * Pass the same `cryptoCache` instance to the `ProtonDrivePublicLinkClient`
 * (via its `cryptoCache` option) so it reuses the seeded material. Once seeded,
 * `getNodeKeys(rootNodeUid)` resolves from the cache and the folder can be used
 * to create files and folders inside it.
 *
 * This is an internal helper and is intentionally not part of the public SDK
 * interface.
 */
export async function seedImportFolderCryptoCache(args: {
    openPGPCryptoModule: OpenPGPCrypto;
    srpModule: SRPModule;
    telemetry?: ProtonDriveTelemetry;
    /** Crypto cache to seed; pass the same instance to the public link client. */
    cryptoCache: ProtonDriveCryptoCache;
    /** The import folder's node crypto material as received from the import payload. */
    importFolder: {
        /** Root node UID, i.e. `${volumeId}~${linkId}`. */
        nodeUid: string;
        key: PrivateKey;
        passphrase: string;
        /** Armored hash key (`link.Folder.NodeHashKey`) forwarded from the import payload. */
        armoredHashKey: string;
    };
}): Promise<void> {
    const telemetry = args.telemetry ?? new Telemetry();
    const driveCrypto = new DriveCrypto(telemetry, args.openPGPCryptoModule, args.srpModule);

    // The hash key is encrypted to the folder's own node key, which the caller
    // holds. Verification keys are not available in the anonymous context, so we
    // do not verify the signature (decryption alone yields the hash key).
    const { hashKey } = await driveCrypto.decryptNodeHashKey(
        args.importFolder.armoredHashKey,
        args.importFolder.key,
        [],
    );

    const cryptoCache = new NodesCryptoCache(telemetry.getLogger('import-folder-injection'), args.cryptoCache);
    await cryptoCache.setNodeKeys(args.importFolder.nodeUid, {
        key: args.importFolder.key,
        passphrase: args.importFolder.passphrase,
        hashKey,
        // Only needed to re-encrypt the passphrase (move/rename); not available
        // when the key is injected directly and not needed to create children.
        passphraseSessionKey: undefined as unknown as SessionKey,
    });
}
