import { c } from 'ttag';

import { Logger, NodeResultWithError } from '../../interface';
import { DecryptedNodeKeys, NodeSigningKeys } from '../nodes/interface';
import { splitNodeUid } from '../uids';
import { AlbumsCryptoService } from './albumsCrypto';
import { PhotosAPIService } from './apiService';
import { MissingRelatedPhotosError } from './errors';
import { PhotoTransferPayloadBuilder, TransferEncryptedPhotoPayload } from './photosTransferPayloadBuilder';
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
    private readonly payloadBuilder: PhotoTransferPayloadBuilder;

    constructor(
        private readonly albumNodeUid: string,
        private readonly albumKeys: DecryptedNodeKeys,
        private readonly signingKeys: NodeSigningKeys,
        private readonly apiService: PhotosAPIService,
        cryptoService: AlbumsCryptoService,
        private readonly nodesService: PhotosNodesAccess,
        private readonly logger: Logger,
        private readonly signal?: AbortSignal,
    ) {
        this.albumVolumeId = splitNodeUid(albumNodeUid).volumeId;
        this.payloadBuilder = new PhotoTransferPayloadBuilder(cryptoService, nodesService);
    }

    async *execute(photoNodeUids: string[]): AsyncGenerator<NodeResultWithError> {
        const { sameVolumeQueue, differentVolumeQueue } = splitByVolume(photoNodeUids, this.albumVolumeId);

        yield* this.processSameVolumeQueue(sameVolumeQueue);
        yield* this.processDifferentVolumeQueue(differentVolumeQueue);
    }

    private async *processSameVolumeQueue(queue: PhotoQueueItem[]): AsyncGenerator<NodeResultWithError> {
        while (queue.length > 0) {
            const items = queue.splice(0, BATCH_LOADING_SIZE);
            const { payloads, errors } = await this.payloadBuilder.preparePhotoPayloads(
                items,
                this.albumNodeUid,
                this.albumKeys,
                this.signingKeys,
                this.signal,
            );

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
            const { payloads, errors } = await this.payloadBuilder.preparePhotoPayloads(
                items,
                this.albumNodeUid,
                this.albumKeys,
                this.signingKeys,
                this.signal,
            );

            for (const [uid, error] of errors) {
                yield { uid, ok: false, error };
            }

            for (const payload of payloads) {
                try {
                    const newPhotoNodeUid = await this.apiService.copyPhotoToAlbum(
                        this.albumNodeUid,
                        payload,
                        this.signal,
                    );
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
                        error:
                            error instanceof Error ? error : new Error(c('Error').t`Unknown error`, { cause: error }),
                    };
                }
            }
        }
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
    private createRetryQueueItem(photoNodeUid: string, error: MissingRelatedPhotosError): PhotoQueueItem | undefined {
        if (this.retriedPhotoUids.has(photoNodeUid)) {
            this.logger.warn(`Missing related photos for ${photoNodeUid}, already retried`);
            return undefined;
        }

        this.retriedPhotoUids.add(photoNodeUid);
        this.logger.info(`Missing related photos for ${photoNodeUid}, re-queuing: ${error.missingNodeUids.join(', ')}`);

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
function* createBatches(payloads: TransferEncryptedPhotoPayload[]): Generator<TransferEncryptedPhotoPayload[]> {
    let batch: TransferEncryptedPhotoPayload[] = [];
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
