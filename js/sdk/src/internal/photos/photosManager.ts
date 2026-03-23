import { c } from 'ttag';

import { AbortError } from '../../errors';
import { Logger, NodeResultWithError, PhotoTag } from '../../interface';
import { batch } from '../batch';
import { PhotosAPIService } from './apiService';
import { PhotoAlreadyInTargetError, PhotoTransferPayloadBuilder, TransferEncryptedPhotoPayload } from './photosTransferPayloadBuilder';
import { PhotosNodesAccess } from './nodes';
import { AlbumsCryptoService } from './albumsCrypto';
import { createBatches } from './addToAlbum';
import { MissingRelatedPhotosError } from './errors';

/**
 * The number of photos that are loaded in parallel to prepare the payloads.
 */
const BATCH_LOADING_SIZE = 20;

export type UpdatePhotoSettings = {
    nodeUid: string;
    tagsToAdd: PhotoTag[];
    tagsToRemove: PhotoTag[];
};

/**
 * Manages updating photos: adding/removing tags and favoriting.
 * Uses the same encrypted payload as add-to-album/copy for the favorite endpoint.
 */
export class PhotosManager {
    private readonly payloadBuilder: PhotoTransferPayloadBuilder;

    constructor(
        private readonly logger: Logger,
        private readonly apiService: PhotosAPIService,
        albumsCryptoService: AlbumsCryptoService,
        private readonly nodesService: PhotosNodesAccess,
    ) {
        this.payloadBuilder = new PhotoTransferPayloadBuilder(albumsCryptoService, nodesService);
    }

    async *saveToTimeline(nodeUids: string[], signal?: AbortSignal): AsyncGenerator<NodeResultWithError> {
        const rootNode = await this.nodesService.getVolumeRootFolder();
        const volumeRootKeys = await this.nodesService.getNodeKeys(rootNode.uid);
        const signingKeys = await this.nodesService.getNodeSigningKeys({ nodeUid: rootNode.uid });

        const queue: {
            photoNodeUid: string;
            additionalRelatedPhotoNodeUids: string[];
        }[] = nodeUids.map((nodeUid) => ({ photoNodeUid: nodeUid, additionalRelatedPhotoNodeUids: [] }));
        const retriedPhotoUids = new Set<string>();

        while (queue.length > 0) {
            const items = queue.splice(0, BATCH_LOADING_SIZE);
            const { payloads, errors } = await this.payloadBuilder.preparePhotoPayloads(
                items,
                rootNode.uid,
                volumeRootKeys,
                signingKeys,
                signal,
            );

            for (const [uid, error] of errors) {
                yield { uid, ok: false, error };
            }

            for (const batch of createBatches(payloads)) {
                for await (const result of this.apiService.transferPhotos(rootNode.uid, batch, signal)) {
                    if (
                        !result.ok &&
                        result.error instanceof MissingRelatedPhotosError &&
                        !retriedPhotoUids.has(result.uid)
                    ) {
                        retriedPhotoUids.add(result.uid);
                        this.logger.info(
                            `Missing related photos for saving ${result.uid}, re-queuing: ${result.error.missingNodeUids.join(', ')}`,
                        );
                        queue.push({
                            photoNodeUid: result.uid,
                            additionalRelatedPhotoNodeUids: result.error.missingNodeUids,
                        });
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

    async *updatePhotos(photos: UpdatePhotoSettings[], signal?: AbortSignal): AsyncGenerator<NodeResultWithError> {
        for await (const {
            photoSettings: { nodeUid, tagsToAdd, tagsToRemove },
            payloadForFavorite,
            error,
        } of this.iterateNodeUidsWithFavoritePayloads(photos, signal)) {
            if (signal?.aborted) {
                throw new AbortError();
            }

            if (error) {
                yield { uid: nodeUid, ok: false, error };
                continue;
            }

            try {
                if (tagsToAdd.includes(PhotoTag.Favorites)) {
                    await this.apiService.setPhotoFavorite(nodeUid, payloadForFavorite);
                }
                const addTags = tagsToAdd.filter((tag) => tag !== PhotoTag.Favorites);
                if (addTags.length) {
                    await this.apiService.addPhotoTags(nodeUid, addTags);
                }
                if (tagsToRemove.length) {
                    await this.apiService.removePhotoTags(nodeUid, tagsToRemove);
                }

                await this.nodesService.notifyNodeChanged(nodeUid);
                yield { uid: nodeUid, ok: true };
            } catch (error) {
                this.logger.error(`Update photos failed for ${nodeUid}`, error);
                yield {
                    uid: nodeUid,
                    ok: false,
                    error: error instanceof Error ? error : new Error(c('Error').t`Unknown error`, { cause: error }),
                };
            }
        }
    }

    private async *iterateNodeUidsWithFavoritePayloads(
        photosSettings: UpdatePhotoSettings[],
        signal?: AbortSignal,
    ): AsyncGenerator<{
        photoSettings: UpdatePhotoSettings;
        payloadForFavorite?: TransferEncryptedPhotoPayload;
        error?: Error;
    }> {
        const photosSettingsWithoutFavorite = photosSettings.filter(
            (photoSettings) => !photoSettings.tagsToAdd?.includes(PhotoTag.Favorites),
        );
        const photosSettingsWithFavorite = photosSettings.filter((photoSettings) =>
            photoSettings.tagsToAdd?.includes(PhotoTag.Favorites),
        );

        for (const photoSettings of photosSettingsWithoutFavorite) {
            yield { photoSettings };
        }

        if (!photosSettingsWithFavorite.length) {
            return;
        }

        const rootNode = await this.nodesService.getVolumeRootFolder();
        const volumeRootKeys = await this.nodesService.getNodeKeys(rootNode.uid);
        const signingKeys = await this.nodesService.getNodeSigningKeys({ nodeUid: rootNode.uid });

        // Batch iteration to fetch metadata for preparing the payloads in parallel.
        for (const photoSettingsBatch of batch(photosSettingsWithFavorite, BATCH_LOADING_SIZE)) {
            if (signal?.aborted) {
                throw new AbortError();
            }

            const result = await this.payloadBuilder.preparePhotoPayloads(
                photoSettingsBatch.map(({ nodeUid }) => ({ photoNodeUid: nodeUid })),
                rootNode.uid,
                volumeRootKeys,
                signingKeys,
                signal,
            );

            for (const [nodeUid, error] of result.errors) {
                const photoSettings = photosSettingsWithFavorite.find(
                    (photoSettings) => photoSettings.nodeUid === nodeUid,
                );
                if (!photoSettings) {
                    this.logger.error(`Photo settings not found for ${nodeUid}, unexpected error`);
                    continue;
                }

                // If the photo is already in the root node, we only set the favorite tag.
                if (error instanceof PhotoAlreadyInTargetError) {
                    yield { photoSettings };
                    continue;
                }
                yield { photoSettings, error };
            }

            for (const payloadForFavorite of result.payloads) {
                const photoSettings = photosSettingsWithFavorite.find(
                    (photoSettings) => photoSettings.nodeUid === payloadForFavorite.nodeUid,
                );
                if (!photoSettings) {
                    this.logger.error(`Photo settings not found for ${payloadForFavorite.nodeUid}, unexpected payload`);
                    continue;
                }
                yield { photoSettings, payloadForFavorite };
            }
        }
    }
}
