import { c } from 'ttag';

import { ValidationError } from '../../errors';
import { Logger, NodeResultWithError } from '../../interface';
import { DecryptedNodeKeys, NodeSigningKeys } from '../nodes/interface';
import { splitNodeUid } from '../uids';
import { AlbumsCryptoService } from './albumsCrypto';
import { PhotosAPIService } from './apiService';
import { MissingRelatedPhotosError } from './errors';
import { AddToAlbumEncryptedPhotoPayload, DecryptedPhotoNode } from './interface';
import { PhotosNodesAccess } from './nodes';

/**
 * The number of photos that are loaded in parallel to prepare the payloads.
 */
const BATCH_LOADING_SIZE = 20;

/**
 * The maximum number of photos that can be added to an album in a single
 * request. The size includes the photo itself and its related photos.
 */
const ADD_PHOTOS_BATCH_SIZE = 10;

/**
 * Item in the processing queue representing a photo to add to an album.
 */
type PhotoQueueItem = {
    photoNodeUid: string;
    /**
     * When retrying after a MissingRelatedPhotosError, these contain the
     * node UIDs reported as missing by the server that need to be included
     * as additional related photos.
     */
    additionalRelatedPhotoNodeUids: string[];
};

/**
 * Manages the process of adding photos to an album.
 *
 * Photos are split into two queues based on volume:
 * - Same volume: added in batches via the add-multiple endpoint.
 * - Different volume: copied individually via the copy endpoint.
 *
 * Both paths handle MissingRelatedPhotosError by re-queuing the failed
 * photo with updated related photo UIDs for one retry attempt.
 */
export class AddToAlbumProcess {
    private readonly albumVolumeId: string;
    private readonly retriedPhotoUids = new Set<string>();

    constructor(
        private readonly albumNodeUid: string,
        private readonly albumKeys: DecryptedNodeKeys,
        private readonly signingKeys: NodeSigningKeys,
        private readonly apiService: PhotosAPIService,
        private readonly cryptoService: AlbumsCryptoService,
        private readonly nodesService: PhotosNodesAccess,
        private readonly logger: Logger,
        private readonly signal?: AbortSignal,
    ) {
        this.albumVolumeId = splitNodeUid(albumNodeUid).volumeId;
    }

    async *execute(photoNodeUids: string[]): AsyncGenerator<NodeResultWithError> {
        const { sameVolumeQueue, differentVolumeQueue } = splitByVolume(photoNodeUids, this.albumVolumeId);

        yield* this.processSameVolumeQueue(sameVolumeQueue);
        yield* this.processDifferentVolumeQueue(differentVolumeQueue);
    }

    private async *processSameVolumeQueue(queue: PhotoQueueItem[]): AsyncGenerator<NodeResultWithError> {
        while (queue.length > 0) {
            const items = queue.splice(0, BATCH_LOADING_SIZE);
            const { payloads, errors } = await this.preparePhotoPayloads(items);

            for (const [uid, error] of errors) {
                yield { uid, ok: false, error };
            }

            for (const batch of createBatches(payloads)) {
                for await (const result of this.apiService.addPhotosToAlbum(this.albumNodeUid, batch, this.signal)) {
                    const retryItem = this.handleMissingRelatedPhotosError(result);
                    if (retryItem) {
                        queue.push(retryItem);
                        continue;
                    }

                    if (result.ok) {
                        await this.nodesService.notifyNodeChanged(result.uid);
                    }
                    yield result;
                }
            }
        }
    }

    private async *processDifferentVolumeQueue(queue: PhotoQueueItem[]): AsyncGenerator<NodeResultWithError> {
        while (queue.length > 0) {
            const items = queue.splice(0, BATCH_LOADING_SIZE);
            const { payloads, errors } = await this.preparePhotoPayloads(items);

            for (const [uid, error] of errors) {
                yield { uid, ok: false, error };
            }

            for (const payload of payloads) {
                try {
                    const newPhotoNodeUid = await this.apiService.copyPhotoToAlbum(this.albumNodeUid, payload, this.signal);
                    await this.nodesService.notifyChildCreated(newPhotoNodeUid);
                    yield { uid: payload.nodeUid, ok: true };
                } catch (error) {
                    if (error instanceof MissingRelatedPhotosError) {
                        const retryItem = this.createRetryQueueItem(payload.nodeUid, error);
                        if (retryItem) {
                            queue.push(retryItem);
                            continue;
                        }
                    }
                    yield {
                        uid: payload.nodeUid,
                        ok: false,
                        error: error instanceof Error ? error : new Error(c('Error').t`Unknown error`, { cause: error }),
                    };
                }
            }
        }
    }

    private async preparePhotoPayloads(items: PhotoQueueItem[]): Promise<{
        payloads: AddToAlbumEncryptedPhotoPayload[];
        errors: Map<string, Error>;
    }> {
        const payloads: AddToAlbumEncryptedPhotoPayload[] = [];
        const errors = new Map<string, Error>();

        const additionalRelatedMap = new Map(
            items.map((item) => [item.photoNodeUid, item.additionalRelatedPhotoNodeUids]),
        );

        const nodeUids = items.map((item) => item.photoNodeUid);
        for await (const photoNode of this.nodesService.iterateNodes(nodeUids, this.signal)) {
            if ('missingUid' in photoNode) {
                errors.set(photoNode.missingUid, new ValidationError(c('Error').t`Photo not found`));
                continue;
            }

            try {
                const additionalRelated = additionalRelatedMap.get(photoNode.uid) || [];
                const payload = await this.preparePhotoPayload(photoNode, additionalRelated);
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
    ): Promise<AddToAlbumEncryptedPhotoPayload> {
        const photoData = await this.encryptPhotoForAlbum(photoNode);

        const relatedNodeUids = [...new Set([
            ...(photoNode.photo?.relatedPhotoNodeUids || []),
            ...additionalRelatedPhotoNodeUids,
        ])];

        const relatedPhotos =
            relatedNodeUids.length > 0 ? await this.prepareRelatedPhotoPayloads(relatedNodeUids) : [];

        return {
            ...photoData,
            relatedPhotos,
        };
    }

    private async prepareRelatedPhotoPayloads(
        nodeUids: string[],
    ): Promise<Omit<AddToAlbumEncryptedPhotoPayload, 'relatedPhotos'>[]> {
        const payloads: Omit<AddToAlbumEncryptedPhotoPayload, 'relatedPhotos'>[] = [];

        for await (const photoNode of this.nodesService.iterateNodes(nodeUids, this.signal)) {
            // Missing related photos means that the related photo was deleted
            // since the loading of the metadata. It can happen and should be
            // ignored. The backend controls all the related photos are part
            // of the request, thus the request will fail and be retried if
            // there is any other race condition.
            if ('missingUid' in photoNode) {
                continue;
            }
            const payload = await this.encryptPhotoForAlbum(photoNode);
            payloads.push(payload);
        }

        return payloads;
    }

    private async encryptPhotoForAlbum(
        photoNode: DecryptedPhotoNode,
    ): Promise<AddToAlbumEncryptedPhotoPayload> {
        const nodeKeys = await this.nodesService.getNodePrivateAndSessionKeys(photoNode.uid);

        const contentSha1 = photoNode.activeRevision?.ok
            ? photoNode.activeRevision.value.claimedDigests?.sha1
            : undefined;

        if (!contentSha1) {
            throw new Error('Cannot add photo to album without a content hash');
        }

        const encryptedCrypto = await this.cryptoService.encryptPhotoForAlbum(
            photoNode.name,
            contentSha1,
            nodeKeys,
            { key: this.albumKeys.key, hashKey: this.albumKeys.hashKey! },
            this.signingKeys,
        );

        // Node could be uploaded or renamed by anonymous user and thus have
        // missing signatures that must be added to the request.
        // Node passphrase and signature email must be passed if and only if
        // the signatures are missing (key author is null).
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

    /**
     * If the result indicates a MissingRelatedPhotosError that hasn't
     * been retried, returns a retry queue item. Otherwise returns undefined.
     */
    private handleMissingRelatedPhotosError(result: NodeResultWithError): PhotoQueueItem | undefined {
        if (!result.ok && result.error instanceof MissingRelatedPhotosError) {
            return this.createRetryQueueItem(result.uid, result.error);
        }
        return undefined;
    }

    /**
     * Creates a retry queue item with the missing related photo UIDs.
     * Returns undefined if the photo has already been retried, preventing
     * infinite retry loops.
     */
    private createRetryQueueItem(
        photoNodeUid: string,
        error: MissingRelatedPhotosError,
    ): PhotoQueueItem | undefined {
        if (this.retriedPhotoUids.has(photoNodeUid)) {
            this.logger.warn(`Missing related photos for ${photoNodeUid}, already retried`);
            return undefined;
        }

        this.retriedPhotoUids.add(photoNodeUid);
        this.logger.info(
            `Missing related photos for ${photoNodeUid}, re-queuing: ${error.missingNodeUids.join(', ')}`,
        );

        return {
            photoNodeUid,
            additionalRelatedPhotoNodeUids: error.missingNodeUids,
        };
    }
}

/**
 * Splits photo UIDs into same-volume and different-volume queues
 * based on the album's volume ID.
 */
function splitByVolume(
    photoNodeUids: string[],
    albumVolumeId: string,
): {
    sameVolumeQueue: PhotoQueueItem[];
    differentVolumeQueue: PhotoQueueItem[];
} {
    const sameVolumeQueue: PhotoQueueItem[] = [];
    const differentVolumeQueue: PhotoQueueItem[] = [];

    for (const photoNodeUid of photoNodeUids) {
        const { volumeId } = splitNodeUid(photoNodeUid);
        const item: PhotoQueueItem = {
            photoNodeUid,
            additionalRelatedPhotoNodeUids: [],
        };

        if (volumeId === albumVolumeId) {
            sameVolumeQueue.push(item);
        } else {
            differentVolumeQueue.push(item);
        }
    }

    return { sameVolumeQueue, differentVolumeQueue };
}

/**
 * Groups payloads into batches respecting the API limit.
 * Each payload's size counts itself plus its related photos.
 */
function* createBatches(
    payloads: AddToAlbumEncryptedPhotoPayload[],
): Generator<AddToAlbumEncryptedPhotoPayload[]> {
    let batch: AddToAlbumEncryptedPhotoPayload[] = [];
    let batchSize = 0;

    for (const payload of payloads) {
        const payloadSize = 1 + (payload.relatedPhotos?.length || 0);

        if (batch.length > 0 && batchSize + payloadSize > ADD_PHOTOS_BATCH_SIZE) {
            yield batch;
            batch = [];
            batchSize = 0;
        }

        batch.push(payload);
        batchSize += payloadSize;
    }

    if (batch.length > 0) {
        yield batch;
    }
}
