import { c } from 'ttag';

import {
    DriveCrypto,
    PrivateKey,
    PublicKey,
    SessionKey,
    uint8ArrayToBase64String,
    VERIFICATION_STATUS,
} from '../../crypto';
import { ProtonDriveAccount, Revision } from '../../interface';
import { DecryptionError, IntegrityError } from '../../errors';
import { getErrorMessage } from '../errors';
import { mergeUint8Arrays } from '../utils';
import { RevisionKeys, SignatureVerificationError } from './interface';

export class DownloadCryptoService {
    constructor(
        private driveCrypto: DriveCrypto,
        private account: ProtonDriveAccount,
    ) {
        this.account = account;
        this.driveCrypto = driveCrypto;
    }

    async getRevisionKeys(
        nodeKey: { key: PrivateKey; contentKeyPacketSessionKey: SessionKey },
        revision: Revision,
    ): Promise<RevisionKeys> {
        const verificationKeys = await this.getRevisionVerificationKeys(revision, nodeKey.key);
        return {
            ...nodeKey,
            verificationKeys,
        };
    }

    async decryptBlock(encryptedBlock: Uint8Array<ArrayBuffer>, revisionKeys: RevisionKeys): Promise<Uint8Array<ArrayBuffer>> {
        let decryptedBlock;
        try {
            // We do not verify signatures on blocks. We only verify
            // the signature on the revision content key packet and
            // the manifest of the revision.
            // We plan to drop signatures of individual blocks
            // completely in the future. Any issue on the blocks
            // should be considered serious integrity issue.
            decryptedBlock = await this.driveCrypto.decryptBlock(
                encryptedBlock,
                revisionKeys.contentKeyPacketSessionKey,
            );
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            throw new DecryptionError(c('Error').t`Failed to decrypt block: ${message}`, { cause: error });
        }

        return decryptedBlock;
    }

    async decryptThumbnail(thumbnail: Uint8Array<ArrayBuffer>, contentKeyPacketSessionKey: SessionKey): Promise<Uint8Array<ArrayBuffer>> {
        let decryptedBlock;
        try {
            const result = await this.driveCrypto.decryptThumbnailBlock(
                thumbnail,
                contentKeyPacketSessionKey,
                [], // We ignore verification for thumbnails.
            );
            decryptedBlock = result.decryptedThumbnail;
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            throw new DecryptionError(c('Error').t`Failed to decrypt thumbnail: ${message}`, { cause: error });
        }

        return decryptedBlock;
    }

    async verifyBlockIntegrity(encryptedBlock: Uint8Array<ArrayBuffer>, base64sha256Hash: string): Promise<void> {
        const digest = await crypto.subtle.digest('SHA-256', encryptedBlock);
        const expectedHash = uint8ArrayToBase64String(new Uint8Array(digest));

        if (expectedHash !== base64sha256Hash) {
            throw new IntegrityError(c('Error').t`Data integrity check of one part failed`, {
                expectedHash,
                actualHash: base64sha256Hash,
            });
        }
    }

    async verifyManifest(
        revision: Revision,
        nodeKey: PrivateKey,
        allBlockHashes: Uint8Array<ArrayBuffer>[],
        armoredManifestSignature?: string,
    ): Promise<void> {
        const hash = mergeUint8Arrays(allBlockHashes);

        if (!armoredManifestSignature) {
            throw new IntegrityError(c('Error').t`Missing integrity signature`);
        }

        let verificationKeys;
        try {
            verificationKeys = await this.getRevisionVerificationKeys(revision, nodeKey);
        } catch (error: unknown) {
            throw new SignatureVerificationError(
                c('Error').t`Failed to get verification keys`,
                { revisionUid: revision.uid, contentAuthor: revision.contentAuthor },
                { cause: error },
            );
        }

        const { verified, verificationErrors } = await this.driveCrypto.verifyManifest(
            hash,
            armoredManifestSignature,
            verificationKeys,
        );

        if (verified !== VERIFICATION_STATUS.SIGNED_AND_VALID) {
            throw new SignatureVerificationError(c('Error').t`Data integrity check failed`, {
                verificationErrors,
            });
        }
    }

    private async getRevisionVerificationKeys(revision: Revision, nodeKey: PrivateKey): Promise<PublicKey[]> {
        const signatureEmail = revision.contentAuthor.ok
            ? revision.contentAuthor.value
            : revision.contentAuthor.error.claimedAuthor;
        return signatureEmail ? await this.account.getPublicKeys(signatureEmail) : [nodeKey];
    }
}
