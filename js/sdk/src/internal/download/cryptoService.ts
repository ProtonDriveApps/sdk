import { c } from 'ttag';

import { DriveCrypto, PrivateKey, PublicKey, SessionKey, uint8ArrayToBase64String, VERIFICATION_STATUS } from "../../crypto";
import { ProtonDriveAccount, Revision } from "../../interface";
import { DecryptionError, IntegrityError } from "../../errors";
import { getErrorMessage } from "../errors";
import { mergeUint8Arrays } from "../utils";
import { RevisionKeys } from "./interface";

export class DownloadCryptoService {
    constructor(private driveCrypto: DriveCrypto, private account: ProtonDriveAccount) {
        this.account = account;
        this.driveCrypto = driveCrypto;
    }

    async getRevisionKeys(nodeKey: { key: PrivateKey, contentKeyPacketSessionKey: SessionKey }, revision: Revision): Promise<RevisionKeys> {
        const verificationKeys = await this.getRevisionVerificationKeys(revision);
        return {
            ...nodeKey,
            verificationKeys,
        }
    }

    async decryptBlock(encryptedBlock: Uint8Array, armoredSignature: string, revisionKeys: RevisionKeys): Promise<Uint8Array> {
        let decryptedBlock;
        try {
            // We do not verify signatures on blocks. We only verify
            // the signature on the revision content key packet and
            // the manifest of the revision.
            // We plan to drop signatures of individual blocks
            // completely in the future. Any issue on the blocks
            // should be considered serious integrity issue.
            const result = await this.driveCrypto.decryptBlock(
                encryptedBlock,
                armoredSignature,
                revisionKeys.key,
                revisionKeys.contentKeyPacketSessionKey,
                revisionKeys.verificationKeys,
            );
            decryptedBlock = result.decryptedBlock;
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            throw new DecryptionError(c('Error').t`Failed to decrypt block: ${message}`);
        }

        return decryptedBlock;
    }

    async decryptThumbnail(thumbnail: Uint8Array, contentKeyPacketSessionKey: SessionKey): Promise<Uint8Array> {
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
            throw new DecryptionError(c('Error').t`Failed to decrypt thumbnail: ${message}`);
        }

        return decryptedBlock;
    }

    async verifyBlockIntegrity(encryptedBlock: Uint8Array, base64sha256Hash: string): Promise<void> {
        const digest = await crypto.subtle.digest('SHA-256', encryptedBlock);
        const expectedHash = uint8ArrayToBase64String(new Uint8Array(digest));

        if (expectedHash !== base64sha256Hash) {
            throw new IntegrityError(c('Error').t`Data integrity check of one part failed`, {
                expectedHash,
                actualHash: base64sha256Hash,
            });
        }
    }

    async verifyManifest(revision: Revision, nodeKey: PrivateKey, allBlockHashes: Uint8Array[], armoredManifestSignature?: string): Promise<void> {
        const verificationKeys = await this.getRevisionVerificationKeys(revision) || nodeKey;
        const hash = mergeUint8Arrays(allBlockHashes);

        if (!armoredManifestSignature) {
            throw new IntegrityError(c('Error').t`Missing integrity signature`);
        }

        const { verified } = await this.driveCrypto.verifyManifest(hash, armoredManifestSignature, verificationKeys);
        if (verified !== VERIFICATION_STATUS.SIGNED_AND_VALID) {
            throw new IntegrityError(c('Error').t`Date integrity check failed`);
        }
    }

    private async getRevisionVerificationKeys(revision: Revision): Promise<PublicKey[] | undefined> {
        const signatureEmail = revision.contentAuthor.ok ? revision.contentAuthor.value : revision.contentAuthor.error.claimedAuthor;
        return signatureEmail ? await this.account.getPublicKeys(signatureEmail) : undefined;
    }
}
