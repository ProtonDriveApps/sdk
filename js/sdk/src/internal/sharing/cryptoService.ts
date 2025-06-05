import bcrypt from 'bcryptjs';
import { c } from 'ttag';

import { DriveCrypto, PrivateKey, SessionKey, uint8ArrayToBase64String, VERIFICATION_STATUS } from '../../crypto';
import { ProtonDriveAccount, ProtonInvitation, ProtonInvitationWithNode, NonProtonInvitation, Author, Result, Member, UnverifiedAuthorError, resultError, resultOk, PublicLink } from "../../interface";
import { getErrorMessage, getVerificationMessage } from "../errors";
import { EncryptedShare } from "../shares";
import { EncryptedInvitation, EncryptedInvitationWithNode, EncryptedExternalInvitation, EncryptedMember, EncryptedPublicLink } from "./interface";

// Version 2 of bcrypt with 2**10 rounds.
// https://en.wikipedia.org/wiki/Bcrypt#Description
const BCRYPT_PREFIX = '$2y$10$';

const PUBLIC_LINK_GENERATED_PASSWORD_LENGTH = 12;

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
    constructor(
        private driveCrypto: DriveCrypto,
        private account: ProtonDriveAccount,
    ) {
        this.driveCrypto = driveCrypto;
        this.account = account;
    }

    /**
     * Generates a share key for a standard share used for sharing with other users.
     * 
     * Standard share, in contrast to a root share, is encrypted with node key and
     * can be managed by any admin.
     */
    async generateShareKeys(
        nodeKeys: {
            key: PrivateKey
            passphraseSessionKey: SessionKey,
            nameSessionKey: SessionKey,
        },
        addressKey: PrivateKey,
    ): Promise<{
        shareKey: {
            encrypted: {
                armoredKey: string,
                armoredPassphrase: string,
                armoredPassphraseSignature: string,
            },
            decrypted: {
                key: PrivateKey,
                passphraseSessionKey: SessionKey,
            },
        },
        base64PpassphraseKeyPacket: string,
        base64NameKeyPacket: string,
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
    };

    /**
     * Decrypts a share using the node key.
     * 
     * The share is encrypted with the node key and can be managed by any admin.
     *
     * Old shares are encrypted with address key only and thus available only
     * to owners. `decryptShare` automatically tries to decrypt the share with
     * address keys as fallback if available.
     */
    async decryptShare(share: EncryptedShare, nodeKey: PrivateKey): Promise<{
        author: Author,
        key: PrivateKey,
        passphraseSessionKey: SessionKey,
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

        const { key, passphraseSessionKey, verified } = await this.driveCrypto.decryptKey(
            share.encryptedCrypto.armoredKey,
            share.encryptedCrypto.armoredPassphrase,
            share.encryptedCrypto.armoredPassphraseSignature,
            decryptionKeys,
            addressPublicKeys,
        )

        const author: Result<string, UnverifiedAuthorError> = verified === VERIFICATION_STATUS.SIGNED_AND_VALID
            ? resultOk(share.creatorEmail)
            : resultError({
                claimedAuthor: share.creatorEmail,
                error: getVerificationMessage(verified),
            });

        return {
            author,
            key,
            passphraseSessionKey,
        }
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
    ): Promise<{
        base64KeyPacket: string,
        base64KeyPacketSignature: string,
    }> {
        const inviteePublicKey = await this.account.getPublicKeys(inviteeEmail);
        const result = await this.driveCrypto.encryptInvitation(shareSessionKey, inviteePublicKey, inviterKey)
        return result;
    };

    /**
     * Decrypts and verifies an invitation and node's name.
     */
    async decryptInvitationWithNode(encryptedInvitation: EncryptedInvitationWithNode): Promise<ProtonInvitationWithNode> {
        const inviteeAddress = await this.account.getOwnAddress(encryptedInvitation.inviteeEmail);
        const inviteeKey = inviteeAddress.keys[inviteeAddress.primaryKeyIndex].key;

        const shareKey = await this.driveCrypto.decryptUnsignedKey(
            encryptedInvitation.share.armoredKey,
            encryptedInvitation.share.armoredPassphrase,
            inviteeKey,
        );

        let nodeName: Result<string, Error>;
        try {
            const result = await this.driveCrypto.decryptNodeName(
                encryptedInvitation.node.encryptedName,
                shareKey,
                [],
            );
            nodeName = resultOk(result.name);
        } catch (error: unknown) {
            const errorMessage = c('Error').t`Failed to decrypt item name: ${getErrorMessage(error)}`;
            nodeName = resultError(new Error(errorMessage));
        }

        return {
            ...await this.decryptInvitation(encryptedInvitation),
            node: {
                name: nodeName,
                type: encryptedInvitation.node.type,
                mediaType: encryptedInvitation.node.mediaType,
            },
        }
    }

    /**
     * Verifies an invitation.
     */
    async decryptInvitation(encryptedInvitation: EncryptedInvitation): Promise<ProtonInvitation> {
        // TODO: verify addedByEmail (current client doesnt do this)
        const addedByEmail: Result<string, UnverifiedAuthorError> = resultOk(encryptedInvitation.addedByEmail);

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
        base64SessionKeySignature: string,
    }> {
        const inviteeAddress = await this.account.getOwnAddress(encryptedInvitation.inviteeEmail);
        const inviteeKey = inviteeAddress.keys[inviteeAddress.primaryKeyIndex].key;
        const result = await this.driveCrypto.acceptInvitation(
            encryptedInvitation.base64KeyPacket,
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
        base64ExternalInvitationSignature: string,
    }> {
        const result = await this.driveCrypto.encryptExternalInvitation(shareSessionKey, inviterKey, inviteeEmail);
        return result;
    }

    /**
     * Verifies an external invitation.
     */
    async decryptExternalInvitation(encryptedInvitation: EncryptedExternalInvitation): Promise<NonProtonInvitation> {
        // TODO: verify addedByEmail (current client doesnt do this)
        const addedByEmail: Result<string, UnverifiedAuthorError> = resultOk(encryptedInvitation.addedByEmail);

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
        // TODO: verify addedByEmail (current client doesnt do this)
        const addedByEmail: Result<string, UnverifiedAuthorError> = resultOk(encryptedMember.addedByEmail);

        return {
            uid: encryptedMember.uid,
            invitationTime: encryptedMember.invitationTime,
            addedByEmail: addedByEmail,
            inviteeEmail: encryptedMember.inviteeEmail,
            role: encryptedMember.role,
        };
    }

    async encryptPublicLink(): Promise<void> {
        const password = await this.generatePassword();
        await this.computeKeySaltAndPassphrase(password);
        // FIXME: finish creation of public links
    }

    private async generatePassword(): Promise<string> {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint32Array(length));

        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset[values[i] % charset.length];
        }

        return result;
    }

    private async computeKeySaltAndPassphrase(password: string) {
        if (!password) {
            throw new Error('Password required.');
        }

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash: string = await bcrypt.hash(password, BCRYPT_PREFIX + bcrypt.encodeBase64(salt, 16));
        // Remove bcrypt prefix and salt (first 29 characters)
        const passphrase = hash.slice(29);

        return {
            base64Salt: uint8ArrayToBase64String(salt),
            passphrase,
        }
    };

    async decryptPublicLink(encryptedPublicLink: EncryptedPublicLink): Promise<PublicLink> {
        const address = await this.account.getOwnAddress(encryptedPublicLink.creatorEmail);
        const addressKeys = address.keys.map(({ key }) => key);

        const { password, customPassword } = await this.decryptShareUrlPassword(
            encryptedPublicLink,
            addressKeys,
        );

        return {
            uid: encryptedPublicLink.uid,
            creationTime: encryptedPublicLink.creationTime,
            expirationTime: encryptedPublicLink.expirationTime,
            role: encryptedPublicLink.role,
            url: `${encryptedPublicLink.publicUrl}#${password}`,
            customPassword,
        }
    }

    private async decryptShareUrlPassword(
        encryptedPublicLink: EncryptedPublicLink,
        addressKeys: PrivateKey[],
    ): Promise<{
        password: string,
        customPassword?: string,
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
                }
            case PublicLinkFlags.GeneratedPasswordIncluded:
            case PublicLinkFlags.GeneratedPasswordWithCustomPassword:
                return {
                    password: password.substring(0, PUBLIC_LINK_GENERATED_PASSWORD_LENGTH),
                    customPassword: password.substring(PUBLIC_LINK_GENERATED_PASSWORD_LENGTH) || undefined,
                }
            default:
                throw new Error(`Unsupported public link with flags: ${encryptedPublicLink.flags}`);
        }
    }
}
