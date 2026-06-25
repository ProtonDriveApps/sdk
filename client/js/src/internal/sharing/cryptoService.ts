import { c } from 'ttag';

import { DriveCrypto, PrivateKey, PublicKey, SessionKey, SRPVerifier, VERIFICATION_STATUS } from '../../crypto';
import { DecryptionError } from '../../errors';
import {
    Author,
    InvalidNameError,
    Logger,
    Member,
    MetricVolumeType,
    NonProtonInvitation,
    ProtonDriveAccount,
    ProtonDriveTelemetry,
    ProtonInvitation,
    ProtonInvitationWithNode,
    Result,
    resultError,
    resultOk,
    UnverifiedAuthorError,
} from '../../interface';
import { getErrorMessage, getVerificationMessage } from '../errors';
import { validateNodeName } from '../nodes/validations';
import { EncryptedShare } from '../shares';
import {
    EncryptedBookmark,
    EncryptedExternalInvitation,
    EncryptedInvitation,
    EncryptedInvitationWithNode,
    EncryptedMember,
    EncryptedPublicLink,
    PublicLinkWithCreatorEmail,
    SharesService,
} from './interface';

export const PUBLIC_LINK_GENERATED_PASSWORD_LENGTH = 12;

// We do not support management of legacy public links anymore (that is no
// flag or bit 1). But we still need to support to read the legacy public
// link.
enum PublicLinkFlags {
    Legacy = 0,
    CustomPassword = 1,
    GeneratedPasswordIncluded = 2,
    GeneratedPasswordWithCustomPassword = 3,
}

/**
 * Provides crypto operations for sharing.
 *
 * The sharing crypto service is responsible for encrypting and decrypting
 * shares, invitations, etc.
 */
export class SharingCryptoService {
    private logger: Logger;

    constructor(
        private telemetry: ProtonDriveTelemetry,
        private driveCrypto: DriveCrypto,
        private account: ProtonDriveAccount,
        private sharesService: SharesService,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLogger('sharing-crypto');
        this.driveCrypto = driveCrypto;
        this.account = account;
        this.sharesService = sharesService;
    }

    /**
     * Generates a share key for a standard share used for sharing with other users.
     *
     * Standard share, in contrast to a root share, is encrypted with node key and
     * can be managed by any admin.
     */
    async generateShareKeys(
        nodeKeys: {
            key: PrivateKey;
            passphraseSessionKey: SessionKey;
            nameSessionKey: SessionKey;
        },
        addressKey: PrivateKey,
    ): Promise<{
        shareKey: {
            encrypted: {
                armoredKey: string;
                armoredPassphrase: string;
                armoredPassphraseSignature: string;
            };
            decrypted: {
                key: PrivateKey;
                passphraseSessionKey: SessionKey;
            };
        };
        base64PpassphraseKeyPacket: string;
        base64NameKeyPacket: string;
    }> {
        const shareKey = await this.driveCrypto.generateKey([nodeKeys.key, addressKey], addressKey);

        const { base64KeyPacket: base64PpassphraseKeyPacket } = await this.driveCrypto.encryptSessionKey(
            nodeKeys.passphraseSessionKey,
            shareKey.decrypted.key,
        );
        const { base64KeyPacket: base64NameKeyPacket } = await this.driveCrypto.encryptSessionKey(
            nodeKeys.nameSessionKey,
            shareKey.decrypted.key,
        );

        return {
            shareKey,
            base64PpassphraseKeyPacket,
            base64NameKeyPacket,
        };
    }

    /**
     * Decrypts a share using the node key.
     *
     * The share is encrypted with the node key and can be managed by any admin.
     *
     * Old shares are encrypted with address key only and thus available only
     * to owners. `decryptShare` automatically tries to decrypt the share with
     * address keys as fallback if available.
     */
    async decryptShare(
        share: EncryptedShare,
        nodeKey: PrivateKey,
    ): Promise<{
        author: Author;
        key: PrivateKey;
        passphrase: string;
        passphraseSessionKey: SessionKey;
    }> {
        // All standard shares should be encrypted with node key.
        // Using node key is essential so any admin can manage the share.
        // Old shares are encrypted with address key only and thus available
        // only to owners. Adding address keys (if available) is a fallback
        // solution until all shares are migrated.
        const decryptionKeys = [nodeKey];
        if (share.addressId) {
            const address = await this.account.getOwnAddress(share.addressId);
            decryptionKeys.push(...address.keys.map(({ key }) => key));
        }
        const addressPublicKeys = await this.account.getPublicKeys(share.creatorEmail);

        const { key, passphrase, passphraseSessionKey, verified, verificationErrors } = await this.driveCrypto.decryptKey(
            share.encryptedCrypto.armoredKey,
            share.encryptedCrypto.armoredPassphrase,
            share.encryptedCrypto.armoredPassphraseSignature,
            decryptionKeys,
            addressPublicKeys,
        );

        const author: Result<string, UnverifiedAuthorError> =
            verified === VERIFICATION_STATUS.SIGNED_AND_VALID
                ? resultOk(share.creatorEmail)
                : resultError({
                      claimedAuthor: share.creatorEmail,
                      error: getVerificationMessage(verified, verificationErrors),
                  });

        return {
            author,
            key,
            passphrase,
            passphraseSessionKey,
        };
    }

    /**
     * Encrypts an invitation for sharing a node with another user.
     *
     * `inviteeEmail` is used to load public key of the invitee and used to
     * encrypt share's session key. `inviterKey` is used to sign the invitation.
     */
    async encryptInvitation(
        shareSessionKey: SessionKey,
        inviterKey: PrivateKey,
        inviteeEmail: string,
        forceRefreshKeys?: boolean,
    ): Promise<{
        base64KeyPacket: string;
        base64KeyPacketSignature: string;
    }> {
        const inviteePublicKeys = await this.account.getPublicKeys(inviteeEmail, forceRefreshKeys);
        const result = await this.driveCrypto.encryptInvitation(shareSessionKey, inviteePublicKeys[0], inviterKey);
        return result;
    }

    /**
     * Decrypts and verifies an invitation and node's name.
     */
    async decryptInvitationWithNode(
        encryptedInvitation: EncryptedInvitationWithNode,
    ): Promise<ProtonInvitationWithNode> {
        const inviteeAddress = await this.account.getOwnAddress(encryptedInvitation.inviteeEmail);
        const inviteeKeys = inviteeAddress.keys.map((k) => k.key);

        const shareKey = await this.driveCrypto.decryptUnsignedKey(
            encryptedInvitation.share.armoredKey,
            encryptedInvitation.share.armoredPassphrase,
            inviteeKeys,
        );

        let nodeName: Result<string, Error>;
        try {
            const result = await this.driveCrypto.decryptNodeName(encryptedInvitation.node.encryptedName, shareKey, []);
            nodeName = resultOk(result.name);
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            const errorMessage = c('Error').t`Failed to decrypt item name: ${message}`;
            nodeName = resultError(new Error(errorMessage, { cause: error }));
        }

        return {
            ...(await this.decryptInvitation(encryptedInvitation)),
            node: {
                uid: encryptedInvitation.node.uid,
                name: nodeName,
                type: encryptedInvitation.node.type,
                mediaType: encryptedInvitation.node.mediaType,
            },
        };
    }

    /**
     * Verifies an invitation.
     */
    async decryptInvitation(encryptedInvitation: EncryptedInvitation): Promise<ProtonInvitation> {
        const addedByEmail = await this.verifyAddedByEmail(encryptedInvitation, async (publicKeys) => {
            return this.driveCrypto.verifyInvitation(
                encryptedInvitation.base64KeyPacket,
                { base64: encryptedInvitation.base64KeyPacketSignature },
                publicKeys,
            );
        });

        return {
            uid: encryptedInvitation.uid,
            invitationTime: encryptedInvitation.invitationTime,
            addedByEmail: addedByEmail,
            inviteeEmail: encryptedInvitation.inviteeEmail,
            role: encryptedInvitation.role,
        };
    }

    /**
     * Accepts an invitation by signing the session key by invitee.
     */
    async acceptInvitation(encryptedInvitation: EncryptedInvitationWithNode): Promise<{
        base64SessionKeySignature: string;
    }> {
        const inviteeAddress = await this.account.getOwnAddress(encryptedInvitation.inviteeEmail);
        const inviteeKey = inviteeAddress.keys[inviteeAddress.primaryKeyIndex].key;
        const inviteeKeys = inviteeAddress.keys.map((k) => k.key);
        const result = await this.driveCrypto.acceptInvitation(
            encryptedInvitation.base64KeyPacket,
            inviteeKeys,
            inviteeKey,
        );
        return result;
    }

    /**
     * Encrypts an external invitation for sharing a node with another user.
     *
     * `inviteeEmail` is used to sign the invitation with `inviterKey`.
     *
     * External invitations are used to share nodes with users who are not
     * registered with Proton Drive. The external invitation then requires
     * the invitee to sign up to create key. Then it can be followed by
     * regular invitation flow.
     */
    async encryptExternalInvitation(
        shareSessionKey: SessionKey,
        inviterKey: PrivateKey,
        inviteeEmail: string,
    ): Promise<{
        base64ExternalInvitationSignature: string;
    }> {
        const result = await this.driveCrypto.encryptExternalInvitation(shareSessionKey, inviterKey, inviteeEmail);
        return result;
    }

    async verifyExternalInvitationSignature(
        inviteeEmail: string,
        shareSessionKey: SessionKey,
        base64Signature: string,
        inviterEmail: string,
    ): Promise<boolean> {
        const verificationKeys = await this.account.getPublicKeys(inviterEmail);
        if (verificationKeys.length === 0) {
            return false;
        }
        const { verified } = await this.driveCrypto.verifyExternalInvitation(
            inviteeEmail,
            shareSessionKey,
            base64Signature,
            verificationKeys,
        );
        return verified === VERIFICATION_STATUS.SIGNED_AND_VALID;
    }

    /**
     * Verifies an external invitation.
     */
    async decryptExternalInvitation(
        encryptedInvitation: EncryptedExternalInvitation,
        sharePassphraseSessionKey: SessionKey,
    ): Promise<NonProtonInvitation> {
        const addedByEmail = await this.verifyAddedByEmail(encryptedInvitation, async (publicKeys) => {
            return this.driveCrypto.verifyExternalInvitation(
                encryptedInvitation.inviteeEmail,
                sharePassphraseSessionKey,
                encryptedInvitation.base64Signature,
                publicKeys,
            );
        });

        return {
            uid: encryptedInvitation.uid,
            invitationTime: encryptedInvitation.invitationTime,
            addedByEmail: addedByEmail,
            inviteeEmail: encryptedInvitation.inviteeEmail,
            role: encryptedInvitation.role,
            state: encryptedInvitation.state,
        };
    }

    /**
     * Verifies a member.
     */
    async decryptMember(encryptedMember: EncryptedMember): Promise<Member> {
        const addedByEmail = await this.verifyAddedByEmail(encryptedMember, async (publicKeys) => {
            return this.driveCrypto.verifyInvitation(
                encryptedMember.base64KeyPacket,
                { base64: encryptedMember.base64KeyPacketSignature },
                publicKeys,
            );
        });

        return {
            uid: encryptedMember.uid,
            invitationTime: encryptedMember.invitationTime,
            addedByEmail: addedByEmail,
            inviteeEmail: encryptedMember.inviteeEmail,
            role: encryptedMember.role,
        };
    }

    /**
     * Decrypts the key packet of a share membership to obtain the member session key.
     *
     * The member session key is the session key used to encrypt the share passphrase
     * for a specific member. It is required when reporting abuse on a direct share.
     *
     * Returns the session key as a base64-encoded string, ready to be sent to the API.
     */
    async getMemberSessionKey(base64KeyPacket: string): Promise<string> {
        const ownAddresses = await this.account.getOwnAddresses();
        const ownAddressKeys = ownAddresses.flatMap((a) => a.keys.map((k) => k.key));
        const { sessionKey } = await this.driveCrypto.decryptAndVerifySessionKey(
            base64KeyPacket,
            undefined,
            ownAddressKeys,
            [],
        );
        return sessionKey.data.toBase64();
    }

    private async verifyAddedByEmail(
        encryptedMetadata: {
            uid: string;
            addedByEmail: string;
            invitationTime: Date;
        },
        verifier: (publicKeys: PublicKey[]) => Promise<{ verified: VERIFICATION_STATUS; verificationErrors?: Error[] }>,
    ): Promise<Result<string, UnverifiedAuthorError>> {
        let addressPublicKeys;
        try {
            addressPublicKeys = await this.account.getPublicKeys(encryptedMetadata.addedByEmail);
        } catch (error: unknown) {
            this.logger.warn(`Failed to get inviter keys: ${getErrorMessage(error)}`);
        }

        try {
            const { verified, verificationErrors } = await verifier(addressPublicKeys || []);

            if (verified === VERIFICATION_STATUS.SIGNED_AND_VALID) {
                return resultOk(encryptedMetadata.addedByEmail);
            }

            this.telemetry.recordMetric({
                eventName: 'verificationError',
                volumeType: MetricVolumeType.Unknown,
                field: 'membershipInviter',
                fromBefore2024: encryptedMetadata.invitationTime < new Date('2024-01-01'),
                error: verificationErrors,
                uid: encryptedMetadata.uid,
            });

            return resultError({
                claimedAuthor: encryptedMetadata.addedByEmail,
                error: getVerificationMessage(verified, verificationErrors, undefined, !addressPublicKeys),
            });
        } catch (error: unknown) {
            this.logger.error(`Failed to verify added by email`, error);
            return resultError({
                claimedAuthor: encryptedMetadata.addedByEmail,
                error: c('Error').t`Failed to verify invitation`,
            });
        }
    }

    async encryptPublicLink(
        creatorEmail: string,
        shareSessionKey: SessionKey,
        password: string,
    ): Promise<{
        crypto: {
            base64SharePasswordSalt: string;
            base64SharePassphraseKeyPacket: string;
            armoredPassword: string;
        };
        srp: SRPVerifier;
    }> {
        const address = await this.account.getOwnAddress(creatorEmail);
        const addressKey = address.keys[address.primaryKeyIndex].key;

        const { base64SharePasswordSalt, base64SharePassphraseKeyPacket, armoredPassword, srp } =
            await this.driveCrypto.encryptPublicLinkPasswordAndSessionKey(password, addressKey, shareSessionKey);

        return {
            crypto: {
                base64SharePasswordSalt,
                base64SharePassphraseKeyPacket,
                armoredPassword,
            },
            srp,
        };
    }

    async generatePublicLinkPassword(): Promise<string> {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint32Array(PUBLIC_LINK_GENERATED_PASSWORD_LENGTH));

        let result = '';
        for (let i = 0; i < PUBLIC_LINK_GENERATED_PASSWORD_LENGTH; i++) {
            result += charset[values[i] % charset.length];
        }

        return result;
    }

    async decryptPublicLink(encryptedPublicLink: EncryptedPublicLink): Promise<PublicLinkWithCreatorEmail> {
        const address = await this.account.getOwnAddress(encryptedPublicLink.creatorEmail);
        const addressKeys = address.keys.map(({ key }) => key);

        const { password, customPassword } = await this.decryptShareUrlPassword(encryptedPublicLink, addressKeys);

        return {
            uid: encryptedPublicLink.uid,
            creationTime: encryptedPublicLink.creationTime,
            expirationTime: encryptedPublicLink.expirationTime,
            role: encryptedPublicLink.role,
            url: `${encryptedPublicLink.publicUrl}#${password}`,
            customPassword,
            creatorEmail: encryptedPublicLink.creatorEmail,
            numberOfInitializedDownloads: encryptedPublicLink.numberOfInitializedDownloads,
        };
    }

    private async decryptShareUrlPassword(
        encryptedPublicLink: Pick<EncryptedPublicLink, 'armoredUrlPassword' | 'flags'>,
        addressKeys: PrivateKey[],
    ): Promise<{
        password: string;
        customPassword?: string;
    }> {
        const password = await this.driveCrypto.decryptShareUrlPassword(
            encryptedPublicLink.armoredUrlPassword,
            addressKeys,
        );

        switch (encryptedPublicLink.flags) {
            // This is legacy that is not supported anymore.
            // Availalbe only for reading.
            case PublicLinkFlags.Legacy:
            case PublicLinkFlags.CustomPassword:
                return {
                    password,
                };
            case PublicLinkFlags.GeneratedPasswordIncluded:
            case PublicLinkFlags.GeneratedPasswordWithCustomPassword:
                return splitGeneratedAndCustomPassword(password);
            default:
                throw new Error(`Unsupported public link with flags: ${encryptedPublicLink.flags}`);
        }
    }

    async encryptBookmark(
        token: string,
        urlPassword: string,
        customPassword?: string,
    ): Promise<{
        token: string;
        encryptedUrlPassword: string;
        addressId: string;
        addressKeyId: string;
    }> {
        const { addressId, addressKey, addressKeyId } = await this.sharesService.getMyFilesShareMemberEmailKey();

        const concanatedPassword = generateConcanatedPassword(urlPassword, customPassword);
        const encryptedUrlPassword = await this.driveCrypto.encryptShareUrlPassword(
            concanatedPassword,
            addressKey,
            addressKey,
        );

        return {
            token,
            encryptedUrlPassword,
            addressId,
            addressKeyId,
        };
    }

    async decryptBookmark(encryptedBookmark: EncryptedBookmark): Promise<{
        url: Result<string, Error>;
        customPassword: Result<string | undefined, Error>;
        nodeName: Result<string, Error | InvalidNameError>;
    }> {
        // TODO: Signatures are not checked and not specified in the interface.
        // In the future, we will need to add authorship verification.

        let password: string;
        let urlPassword: string;
        let customPassword: Result<string | undefined, Error>;
        try {
            password = await this.decryptBookmarkUrlPassword(encryptedBookmark);
            const result = splitGeneratedAndCustomPassword(password);
            urlPassword = result.password;
            customPassword = resultOk(result.customPassword);
        } catch (originalError: unknown) {
            const error =
                originalError instanceof Error
                    ? originalError
                    : new Error(c('Error').t`Unknown error`, { cause: originalError });
            return {
                url: resultError(error),
                customPassword: resultError(error),
                nodeName: resultError(error),
            };
        }

        // TODO: API should provide the full URL.
        const url = resultOk<string, Error>(`https://drive.proton.me/urls/${encryptedBookmark.tokenId}#${urlPassword}`);

        let shareKey: PrivateKey;
        try {
            shareKey = await this.decryptBookmarkKey(encryptedBookmark, password);
        } catch (originalError: unknown) {
            const error =
                originalError instanceof Error
                    ? originalError
                    : new Error(c('Error').t`Unknown error`, { cause: originalError });
            return {
                url,
                customPassword,
                nodeName: resultError(error),
            };
        }

        const nodeName = await this.decryptBookmarkName(encryptedBookmark, shareKey);

        return {
            url,
            customPassword,
            nodeName,
        };
    }

    private async decryptBookmarkUrlPassword(encryptedBookmark: EncryptedBookmark): Promise<string> {
        if (!encryptedBookmark.url.encryptedUrlPassword) {
            throw new Error(c('Error').t`Bookmark password is not available`);
        }

        const { addressId } = await this.sharesService.getMyFilesShareMemberEmailKey();
        const address = await this.account.getOwnAddress(addressId);
        const addressKeys = address.keys.map(({ key }) => key);

        try {
            // Decrypt the password for the share URL.
            const urlPassword = await this.driveCrypto.decryptShareUrlPassword(
                encryptedBookmark.url.encryptedUrlPassword,
                addressKeys,
            );

            return urlPassword;
        } catch (error: unknown) {
            this.telemetry.recordMetric({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'shareUrlPassword',
                error,
                uid: encryptedBookmark.tokenId,
            });

            const message = getErrorMessage(error);
            const errorMessage = c('Error').t`Failed to decrypt bookmark password: ${message}`;
            throw new DecryptionError(errorMessage, { cause: error });
        }
    }

    private async decryptBookmarkKey(encryptedBookmark: EncryptedBookmark, password: string): Promise<PrivateKey> {
        try {
            // Use the password to decrypt the share key.
            const { key: shareKey } = await this.driveCrypto.decryptKeyWithSrpPassword(
                password,
                encryptedBookmark.url.base64SharePasswordSalt,
                encryptedBookmark.share.armoredKey,
                encryptedBookmark.share.armoredPassphrase,
            );

            return shareKey;
        } catch (error: unknown) {
            this.telemetry.recordMetric({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'shareKey',
                error,
                uid: encryptedBookmark.tokenId,
            });

            const message = getErrorMessage(error);
            const errorMessage = c('Error').t`Failed to decrypt bookmark key: ${message}`;
            throw new DecryptionError(errorMessage, { cause: error });
        }
    }

    private async decryptBookmarkName(
        encryptedBookmark: EncryptedBookmark,
        shareKey: PrivateKey,
    ): Promise<Result<string, Error | InvalidNameError>> {
        try {
            // Use the share key to decrypt the node name of the bookmark.
            const { name } = await this.driveCrypto.decryptNodeName(encryptedBookmark.node.encryptedName, shareKey, []);

            try {
                validateNodeName(name);
            } catch (error: unknown) {
                return resultError({
                    name,
                    error: error instanceof Error ? error.message : c('Error').t`Unknown error`,
                });
            }

            return resultOk(name);
        } catch (error: unknown) {
            this.telemetry.recordMetric({
                eventName: 'decryptionError',
                volumeType: MetricVolumeType.SharedPublic,
                field: 'nodeName',
                error,
                uid: encryptedBookmark.tokenId,
            });

            const message = getErrorMessage(error);
            const errorMessage = c('Error').t`Failed to decrypt bookmark name: ${message}`;
            return resultError(new Error(errorMessage, { cause: error }));
        }
    }
}

function splitGeneratedAndCustomPassword(concatenatedPassword: string): {
    password: string;
    customPassword?: string;
} {
    const password = concatenatedPassword.substring(0, PUBLIC_LINK_GENERATED_PASSWORD_LENGTH);
    const customPassword = concatenatedPassword.substring(PUBLIC_LINK_GENERATED_PASSWORD_LENGTH) || undefined;
    return { password, customPassword };
}

function generateConcanatedPassword(urlPassword: string, customPassword?: string): string {
    const concatenatedPassword = urlPassword.concat(customPassword || '');
    return concatenatedPassword;
}
