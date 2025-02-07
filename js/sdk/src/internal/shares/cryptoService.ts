import { ProtonDriveAccount, resultOk, resultError, Result, UnverifiedAuthorError } from "../../interface";
import { DriveCrypto, PrivateKey, VERIFICATION_STATUS } from "../../crypto";
import { EncryptedRootShare, DecryptedRootShare, EncryptedShareCrypto, DecryptedShareKey } from "./interface";

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
export class SharesCryptoService {
    constructor(private driveCrypto: DriveCrypto, private account: ProtonDriveAccount) {
        this.driveCrypto = driveCrypto;
        this.account = account;
    }

    async generateVolumeBootstrap(addressKey: PrivateKey): Promise<{
        shareKey: { encrypted: EncryptedShareCrypto, decrypted: DecryptedShareKey },
        rootNode: {
            key: { encrypted: EncryptedShareCrypto, decrypted: DecryptedShareKey },
            encryptedName: string,
            armoredHashKey: string,
        }
    }> {
        const shareKey = await this.driveCrypto.generateKey([addressKey], addressKey);
        const rootNodeKey = await this.driveCrypto.generateKey([shareKey.decrypted.key], addressKey);
        const { armoredNodeName } = await this.driveCrypto.encryptNodeName('root', shareKey.decrypted.key, addressKey);
        const { armoredHashKey } = await this.driveCrypto.generateHashKey(rootNodeKey.decrypted.key);
        return {
            shareKey,
            rootNode: {
                key: rootNodeKey,
                encryptedName: armoredNodeName,
                armoredHashKey,
            },
        }
    }

    async decryptRootShare(share: EncryptedRootShare): Promise<{ share: DecryptedRootShare, key: DecryptedShareKey }> {
        const addressPrivateKeys = await this.account.getOwnPrivateKeys(share.addressId);
        const addressPublicKeys = await this.account.getPublicKeys(share.creatorEmail);

        const { key, sessionKey, verified } = await this.driveCrypto.decryptKey(
            share.encryptedCrypto.armoredKey,
            share.encryptedCrypto.armoredPassphrase,
            share.encryptedCrypto.armoredPassphraseSignature,
            addressPrivateKeys,
            addressPublicKeys,
        )

        const author: Result<string, UnverifiedAuthorError> = verified === VERIFICATION_STATUS.SIGNED_AND_VALID
            ? resultOk(share.creatorEmail)
            : resultError({
                claimedAuthor: share.creatorEmail,
                error: verified === VERIFICATION_STATUS.SIGNED_AND_INVALID
                    ? `Verification signature failed`
                    : `Missing signature`,
            });

        return {
            share: {
                ...share,
                author,
            },
            key: {
                key,
                sessionKey,
            },
        }
    }
}
