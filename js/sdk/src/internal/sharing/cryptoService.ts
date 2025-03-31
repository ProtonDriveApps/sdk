import { c } from 'ttag';

import { DriveCrypto, PrivateKey, SessionKey, VERIFICATION_STATUS } from '../../crypto';
import { ProtonDriveAccount, ProtonInvitation, ProtonInvitationWithNode, NonProtonInvitation, Author, Result, Member, UnverifiedAuthorError, InvalidNameError, resultError, resultOk } from "../../interface";
import { getErrorMessage, getVerificationMessage } from "../errors";
import { EncryptedShare } from "../shares";
import { EncryptedInvitation, EncryptedInvitationWithNode, EncryptedExternalInvitation, EncryptedMember } from "./interface";

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

        let nodeName: Result<string, InvalidNameError>;
        try {
            const result = await this.driveCrypto.decryptNodeName(
                encryptedInvitation.node.encryptedName,
                shareKey,
                [],
            );
            nodeName = resultOk(result.name);
        } catch (error: unknown) {
            const errorMessage = c('Error').t`Failed to decrypt item name: ${getErrorMessage(error)}`;
            nodeName = resultError({ name: '', error: errorMessage });
        }

        return {
            ...await this.decryptInvitation(encryptedInvitation),
            node: {
                name: nodeName,
                type: encryptedInvitation.node.type,
                mimeType: encryptedInvitation.node.mimeType,
            },
        }
    }

    /**
     * Verifies an invitation.
     */
    async decryptInvitation(encryptedInvitation: EncryptedInvitation): Promise<ProtonInvitation> {
        // FIXME: verify addedByEmail (current client doesnt do this)
        const addedByEmail: Result<string, UnverifiedAuthorError> = resultOk(encryptedInvitation.addedByEmail);

        return {
            uid: encryptedInvitation.uid,
            invitedDate: encryptedInvitation.invitedDate,
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
        // FIXME: verify addedByEmail (current client doesnt do this)
        const addedByEmail: Result<string, UnverifiedAuthorError> = resultOk(encryptedInvitation.addedByEmail);

        return {
            uid: encryptedInvitation.uid,
            invitedDate: encryptedInvitation.invitedDate,
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
        // FIXME: verify addedByEmail (current client doesnt do this)
        const addedByEmail: Result<string, UnverifiedAuthorError> = resultOk(encryptedMember.addedByEmail);

        return {
            uid: encryptedMember.uid,
            invitedDate: encryptedMember.invitedDate,
            addedByEmail: addedByEmail,
            inviteeEmail: encryptedMember.inviteeEmail,
            role: encryptedMember.role,
        };
    }
}
