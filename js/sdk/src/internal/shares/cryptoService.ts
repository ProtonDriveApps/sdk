import { ProtonDriveAccount, resultOk, resultError, Result, UnverifiedAuthorError, ProtonDriveTelemetry, Logger } from "../../interface";
import { DriveCrypto, PrivateKey, VERIFICATION_STATUS } from "../../crypto";
import { getVerificationMessage } from "../errors";
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
    private logger: Logger;

    private reportedDecryptionErrors = new Set<string>();
    private reportedVerificationErrors = new Set<string>();

    constructor(private telemetry: ProtonDriveTelemetry, private driveCrypto: DriveCrypto, private account: ProtonDriveAccount) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('shares-crypto');
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
        const { armoredNodeName } = await this.driveCrypto.encryptNodeName('root', undefined, shareKey.decrypted.key, addressKey);
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
        const { keys: addressKeys } = await this.account.getOwnAddress(share.addressId);
        const addressPublicKeys = await this.account.getPublicKeys(share.creatorEmail);

        let key, passphraseSessionKey, verified;
        try {
            const result = await this.driveCrypto.decryptKey(
                share.encryptedCrypto.armoredKey,
                share.encryptedCrypto.armoredPassphrase,
                share.encryptedCrypto.armoredPassphraseSignature,
                addressKeys.map(({ key }) => key),
                addressPublicKeys,
            )
            key = result.key;
            passphraseSessionKey = result.passphraseSessionKey;
            verified = result.verified;
        } catch (error: unknown) {
            this.reportDecryptionError(share, error);
            throw error;
        }

        const author: Result<string, UnverifiedAuthorError> = verified === VERIFICATION_STATUS.SIGNED_AND_VALID
            ? resultOk(share.creatorEmail)
            : resultError({
                claimedAuthor: share.creatorEmail,
                error: getVerificationMessage(verified),
            });

        if (!author.ok) {
            await this.reportVerificationError(share);
        }

        return {
            share: {
                ...share,
                author,
            },
            key: {
                key,
                passphraseSessionKey,
            },
        }
    }
    
    private reportDecryptionError(share: EncryptedRootShare, error?: unknown) {
        if (this.reportedDecryptionErrors.has(share.shareId)) {
            return;
        }

        const fromBefore2024 = share.createdDate ? share.createdDate < new Date('2024-01-01') : undefined;
        this.logger.error(`Failed to decrypt share ${share.shareId} (from before 2024: ${fromBefore2024})`, error);

        this.telemetry.logEvent({
            eventName: 'decryptionError',
            context: 'own_volume', // TODO: add context to the share
            field: 'shareKey',
            fromBefore2024,
            error,
        });
        this.reportedDecryptionErrors.add(share.shareId);
    }

    private async reportVerificationError(share: EncryptedRootShare) {
        if (this.reportedVerificationErrors.has(share.shareId)) {
            return;
        }

        const fromBefore2024 = share.createdDate ? share.createdDate < new Date('2024-01-01') : undefined;
        const addressMatchingDefaultShare = undefined; // TODO: check if claimed author matches default share
        this.logger.error(`Failed to verify share ${share.shareId} (from before 2024: ${fromBefore2024}, matching address: ${addressMatchingDefaultShare})`);

        this.telemetry.logEvent({
            eventName: 'verificationError',
            context: 'own_volume', // TODO: add context to the share
            field: 'shareKey',
            addressMatchingDefaultShare,
            fromBefore2024,
        });
        this.reportedVerificationErrors.add(share.shareId);
    }
}
