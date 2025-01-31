import { ProtonDriveAccount } from "../../interface/index.js";
import { DriveCrypto, PrivateKey, VERIFICATION_STATUS } from "../../crypto/index.js";
import { EncryptedRootShare, DecryptedRootShare, EncryptedShareCrypto, DecryptedShareCrypto } from "./interface.js";

/**
 * Provides crypto operations for share keys.
 * 
 * The share crypto service is responsible for encrypting and decrypting share
 * keys. It should export high-level actions only, such as "decrypt share"
 * instead of low-level operations like "decrypt share passphrase". Low-level
 * operations should be kept private to the module.
 * 
 * The service owns the logic to switch between old and new crypto model.
 */
export function sharesCryptoService(driveCrypto: DriveCrypto, account: ProtonDriveAccount) {
    async function generateVolumeBootstrap(addressKey: PrivateKey): Promise<{
        shareKey: { encrypted: EncryptedShareCrypto, decrypted: DecryptedShareCrypto },
        rootNode: {
            keys: { encrypted: EncryptedShareCrypto, decrypted: DecryptedShareCrypto },
            encryptedName: string,
            armoredHashKey: string,
        }
    }> {
        const shareKey = await driveCrypto.generateKey([addressKey], addressKey);
        const rootNodeKeys = await driveCrypto.generateKey([shareKey.decrypted.key], addressKey);
        const { armoredNodeName } = await driveCrypto.encryptNodeName('root', shareKey.decrypted.key, addressKey);
        const { armoredHashKey } = await driveCrypto.generateHashKey(rootNodeKeys.decrypted.key);
        return {
            shareKey,
            rootNode: {
                keys: rootNodeKeys,
                encryptedName: armoredNodeName,
                armoredHashKey,
            },
        }
    }

    async function decryptRootShare(share: EncryptedRootShare): Promise<DecryptedRootShare> {
        const addressPrivateKeys = await account.getOwnPrivateKeys(share.addressId);
        const addressPublicKeys = await account.getPublicKeys(share.creatorEmail);

        const { key, sessionKey, verified } = await driveCrypto.decryptKey(
            share.encryptedCrypto.armoredKey,
            share.encryptedCrypto.armoredPassphrase,
            share.encryptedCrypto.armoredPassphraseSignature,
            addressPrivateKeys,
            addressPublicKeys,
        )

        if (verified !== VERIFICATION_STATUS.SIGNED_AND_VALID) {
            // TODO: error object and message
            throw new Error('Failed to verify share passphrase');
        }

        return {
            ...share,
            decryptedCrypto: {
                key,
                sessionKey,
            }
        }
    }

    return {
        generateVolumeBootstrap,
        decryptRootShare,
    }
}
