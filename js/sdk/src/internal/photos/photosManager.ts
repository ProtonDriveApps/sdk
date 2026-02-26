import { c } from 'ttag';

import { Logger, NodeResultWithError, PhotoTag } from '../../interface';
import { PhotosAPIService } from './apiService';
import { PhotoAlreadyInTargetError, PhotoTransferPayloadBuilder, TransferEncryptedPhotoPayload } from './photosTransferPayloadBuilder';
import { PhotosNodesAccess } from './nodes';
import { AlbumsCryptoService } from './albumsCrypto';
import { AbortError } from '../../errors';
import { BATCH_LOADING_SIZE } from '../sharing/sharingAccess';
import { batch } from '../batch';

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
