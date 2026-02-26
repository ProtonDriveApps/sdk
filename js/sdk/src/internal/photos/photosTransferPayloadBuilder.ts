import { c } from 'ttag';

import { ValidationError } from '../../errors';
import { DecryptedNodeKeys, NodeSigningKeys } from '../nodes/interface';
import { AlbumsCryptoService } from './albumsCrypto';
import { DecryptedPhotoNode } from './interface';
import { PhotosNodesAccess } from './nodes';

export type TransferEncryptedPhotoPayload = TransferEncryptedRelatedPhotoPayload & {
    relatedPhotos: TransferEncryptedRelatedPhotoPayload[];
};

type TransferEncryptedRelatedPhotoPayload = {
    nodeUid: string;
    contentHash: string;
    nameHash: string;
    encryptedName: string;
    nameSignatureEmail: string;
    nodePassphrase: string;
    nodePassphraseSignature?: string;
    signatureEmail?: string;
}

/**
 * Item representing a photo to build a payload for.
 * Used when preparing payloads for add-to-album (with optional retry related UIDs)
 * or for favoriting.
 */
export type PhotoPayloadItem = {
    photoNodeUid: string;
    /**
     * Additional related photo node UIDs to include (e.g. when retrying after
     * MissingRelatedPhotosError).
     */
    additionalRelatedPhotoNodeUids?: string[];
};

/**
 * Builds encrypted photo payloads (TransferEncryptedPhotoPayload) for a set of
 * photos, including their related photos. Reused by add-to-album and favorite
 * flows, which only differ by the target keys used for encryption.
 */
export class PhotoTransferPayloadBuilder {
    constructor(
        private readonly cryptoService: AlbumsCryptoService,
        private readonly nodesService: PhotosNodesAccess,
    ) {}

    /**
     * Prepares encrypted payloads for the given photo items using the provided
     * target keys and signing keys. Used for add-to-album (album keys) and
     * favoriting (volume root keys).
     */
    async preparePhotoPayloads(
        items: PhotoPayloadItem[],
        targetNodeUid: string,
        targetKeys: DecryptedNodeKeys,
        signingKeys: NodeSigningKeys,
        signal?: AbortSignal,
    ): Promise<{
        payloads: TransferEncryptedPhotoPayload[];
        errors: Map<string, Error>;
    }> {
        const payloads: TransferEncryptedPhotoPayload[] = [];
        const errors = new Map<string, Error>();

        if (!targetKeys.hashKey) {
            throw new Error('Target hash key is required to build photo payloads');
        }

        const additionalRelatedMap = new Map(
            items.map((item) => [item.photoNodeUid, item.additionalRelatedPhotoNodeUids || []]),
        );

        const nodeUids = items.map((item) => item.photoNodeUid);
        for await (const photoNode of this.nodesService.iterateNodes(nodeUids, signal)) {
            if ('missingUid' in photoNode) {
                errors.set(photoNode.missingUid, new ValidationError(c('Error').t`Photo not found`));
                continue;
            }

            if (photoNode.parentUid === targetNodeUid) {
                errors.set(photoNode.uid, new PhotoAlreadyInTargetError());
                continue;
            }

            try {
                const additionalRelated = additionalRelatedMap.get(photoNode.uid) || [];
                const payload = await this.preparePhotoPayload(
                    photoNode,
                    additionalRelated,
                    targetKeys,
                    signingKeys,
                    signal,
                );
                payloads.push(payload);
            } catch (error) {
                errors.set(
                    photoNode.uid,
                    error instanceof Error ? error : new Error(c('Error').t`Unknown error`, { cause: error }),
                );
            }
        }

        return { payloads, errors };
    }

    private async preparePhotoPayload(
        photoNode: DecryptedPhotoNode,
        additionalRelatedPhotoNodeUids: string[],
        targetKeys: DecryptedNodeKeys,
        signingKeys: NodeSigningKeys,
        signal?: AbortSignal,
    ): Promise<TransferEncryptedPhotoPayload> {
        const photoData = await this.encryptPhotoForTarget(photoNode, targetKeys, signingKeys);

        const relatedNodeUids = [
            ...new Set([
                ...(photoNode.photo?.relatedPhotoNodeUids || []),
                ...additionalRelatedPhotoNodeUids,
            ]),
        ];

        const relatedPhotos =
            relatedNodeUids.length > 0
                ? await this.prepareRelatedPhotoPayloads(relatedNodeUids, targetKeys, signingKeys, signal)
                : [];

        return {
            ...photoData,
            relatedPhotos,
        };
    }

    private async prepareRelatedPhotoPayloads(
        nodeUids: string[],
        targetKeys: DecryptedNodeKeys,
        signingKeys: NodeSigningKeys,
        signal?: AbortSignal,
    ): Promise<Omit<TransferEncryptedPhotoPayload, 'relatedPhotos'>[]> {
        const payloads: Omit<TransferEncryptedPhotoPayload, 'relatedPhotos'>[] = [];

        for await (const photoNode of this.nodesService.iterateNodes(nodeUids, signal)) {
            if ('missingUid' in photoNode) {
                continue;
            }
            const payload = await this.encryptPhotoForTarget(photoNode, targetKeys, signingKeys);
            payloads.push(payload);
        }

        return payloads;
    }

    private async encryptPhotoForTarget(
        photoNode: DecryptedPhotoNode,
        targetKeys: DecryptedNodeKeys,
        signingKeys: NodeSigningKeys,
    ): Promise<Omit<TransferEncryptedPhotoPayload, 'relatedPhotos'>> {
        const nodeKeys = await this.nodesService.getNodePrivateAndSessionKeys(photoNode.uid);

        const contentSha1 = photoNode.activeRevision?.ok
            ? photoNode.activeRevision.value.claimedDigests?.sha1
            : undefined;

        if (!contentSha1) {
            throw new Error('Cannot build photo payload without a content hash');
        }

        const encryptedCrypto = await this.cryptoService.encryptPhotoForAlbum(
            photoNode.name,
            contentSha1,
            nodeKeys,
            { key: targetKeys.key, hashKey: targetKeys.hashKey! },
            signingKeys,
        );

        const anonymousKey = photoNode.keyAuthor.ok && photoNode.keyAuthor.value === null;
        const keySignatureProperties = !anonymousKey
            ? {}
            : {
                  signatureEmail: encryptedCrypto.signatureEmail,
                  nodePassphraseSignature: encryptedCrypto.armoredNodePassphraseSignature,
              };

        return {
            nodeUid: photoNode.uid,
            contentHash: encryptedCrypto.contentHash,
            nameHash: encryptedCrypto.hash,
            encryptedName: encryptedCrypto.encryptedName,
            nameSignatureEmail: encryptedCrypto.nameSignatureEmail,
            nodePassphrase: encryptedCrypto.armoredNodePassphrase,
            ...keySignatureProperties,
        };
    }
}

export class PhotoAlreadyInTargetError extends ValidationError {
    name = 'PhotoAlreadyInTargetError';

    constructor() {
        super(c('Error').t`Photo is already in the target album`);
    }
}
