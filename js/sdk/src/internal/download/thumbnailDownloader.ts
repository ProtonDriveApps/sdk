import { c } from 'ttag';

import {  ThumbnailType, ProtonDriveTelemetry, Logger, ThumbnailResult } from '../../interface';
import { ValidationError } from '../../errors';
import { LoggerWithPrefix } from '../../telemetry';
import { DownloadAPIService } from './apiService';
import { DownloadCryptoService } from './cryptoService';
import { NodesService } from './interface';
import { getErrorMessage } from '../errors';

/**
 * Maximum number of thumbnails that can be downloaded at the same time.
 */
const MAX_DOWNLOAD_THUMBNAILS = 10;

/**
 * Maximum number of retries for thumbnail download and decryption.
 */
const MAX_THUMBNAIL_DOWNLOAD_ATTEMPTS = 2;

export class ThumbnailDownloader {
    private logger: Logger;

    private batchThumbnailToNodeUids = new Map<string, string>();
    private ongoingDownloads = new Map<string, Promise<void>>();
    private bufferedThumbnails: (
        | { nodeUid: string; ok: true; thumbnail: Uint8Array<ArrayBuffer> }
        | { nodeUid: string; ok: false; error: string }
    )[] = [];

    constructor(
        telemetry: ProtonDriveTelemetry,
        private nodesService: NodesService,
        private apiService: DownloadAPIService,
        private cryptoService: DownloadCryptoService,
    ) {
        this.logger = telemetry.getLogger('download');
        this.nodesService = nodesService;
        this.apiService = apiService;
        this.cryptoService = cryptoService;
    }

    async *iterateThumbnails(
        nodeUids: string[],
        thumbnailType = ThumbnailType.Type1,
        signal?: AbortSignal,
    ): AsyncGenerator<ThumbnailResult> {
        if (nodeUids.length === 0) {
            return;
        }

        for await (const result of this.iterateThumbnailUids(nodeUids, thumbnailType, signal)) {
            if (!result.ok) {
                yield result;
                continue;
            }

            this.batchThumbnailToNodeUids.set(result.thumbnailUid, result.nodeUid);
            if (this.batchThumbnailToNodeUids.size >= MAX_DOWNLOAD_THUMBNAILS) {
                await this.requestBatchedThumbnailDownloads(signal);
            }

            while (this.ongoingDownloads.size >= MAX_DOWNLOAD_THUMBNAILS) {
                await Promise.race(this.ongoingDownloads.values());
                yield* this.bufferedThumbnails;
                this.bufferedThumbnails = [];
            }
        }

        await this.requestBatchedThumbnailDownloads(signal);

        while (this.ongoingDownloads.size > 0) {
            await Promise.race(this.ongoingDownloads.values());
            yield* this.bufferedThumbnails;
            this.bufferedThumbnails = [];
        }

        yield* this.bufferedThumbnails;
        this.bufferedThumbnails = [];
    }

    private async *iterateThumbnailUids(
        nodeUids: string[],
        thumbnailType: ThumbnailType,
        signal?: AbortSignal,
    ): AsyncGenerator<
        { nodeUid: string; ok: true; thumbnailUid: string } | { nodeUid: string; ok: false; error: string }
    > {
        for await (const node of this.nodesService.iterateNodes(nodeUids, signal)) {
            if ('missingUid' in node) {
                yield {
                    nodeUid: node.missingUid,
                    ok: false,
                    error: c('Error').t`Node not found`,
                };
                continue;
            }

            let thumbnail;
            if (node.activeRevision?.ok) {
                thumbnail = node.activeRevision.value.thumbnails?.find((t) => t.type === thumbnailType);
            }
            if (!thumbnail) {
                yield {
                    nodeUid: node.uid,
                    ok: false,
                    error: c('Error').t`Node has no thumbnail`,
                };
                continue;
            }

            yield {
                nodeUid: node.uid,
                ok: true,
                thumbnailUid: thumbnail.uid,
            };
        }
    }

    private async requestBatchedThumbnailDownloads(signal?: AbortSignal) {
        if (this.batchThumbnailToNodeUids.size === 0) {
            return;
        }

        this.logger.debug(`Downloading thumbnail batch of size ${this.batchThumbnailToNodeUids.size}`);

        for await (const downloadResult of this.iterateThumbnailDownloads(signal)) {
            if (!downloadResult.ok) {
                this.bufferedThumbnails.push({
                    nodeUid: downloadResult.nodeUid,
                    ok: false,
                    error: downloadResult.error,
                });
                continue;
            }

            this.ongoingDownloads.set(
                downloadResult.nodeUid,
                downloadResult.downloadPromise
                    .then((thumbnail) => {
                        this.bufferedThumbnails.push({
                            nodeUid: downloadResult.nodeUid,
                            ok: true,
                            thumbnail,
                        });
                    })
                    .catch((error) => {
                        this.bufferedThumbnails.push({
                            nodeUid: downloadResult.nodeUid,
                            ok: false,
                            error: getErrorMessage(error),
                        });
                    })
                    .finally(() => {
                        this.ongoingDownloads.delete(downloadResult.nodeUid);
                    }),
            );
        }

        this.batchThumbnailToNodeUids.clear();
    }

    private async *iterateThumbnailDownloads(
        signal?: AbortSignal,
    ): AsyncGenerator<
        | { nodeUid: string; ok: true; downloadPromise: Promise<Uint8Array<ArrayBuffer>> }
        | { nodeUid: string; ok: false; error: string }
    > {
        const missingThumbnailUids = new Set(this.batchThumbnailToNodeUids.keys());

        for await (const result of this.apiService.iterateThumbnails(
            Array.from(this.batchThumbnailToNodeUids.keys()),
            signal,
        )) {
            const nodeUid = this.batchThumbnailToNodeUids.get(result.uid);
            if (!nodeUid) {
                this.logger.warn(`Unexpected thumbnail UID ${result.uid} returned from API`);
                continue;
            }

            missingThumbnailUids.delete(result.uid);

            if (!result.ok) {
                yield {
                    nodeUid,
                    ok: false,
                    error: result.error,
                };
                continue;
            }

            yield {
                nodeUid,
                ok: true,
                downloadPromise: this.downloadThumbnail(nodeUid, result.bareUrl, result.token, signal),
            };
        }

        for (const uid of missingThumbnailUids) {
            const nodeUid = this.batchThumbnailToNodeUids.get(uid)!;
            this.logger.warn(`Thumbnail UID ${uid} not found in API response`);
            yield {
                nodeUid,
                ok: false,
                error: c('Error').t`Thumbnail not found`,
            };
        }
    }

    private async downloadThumbnail(
        nodeUid: string,
        bareUrl: string,
        token: string,
        signal?: AbortSignal,
    ): Promise<Uint8Array<ArrayBuffer>> {
        const logger = new LoggerWithPrefix(this.logger, `thumbnail ${token}`);

        let decryptedBlock: Uint8Array<ArrayBuffer> | null = null;
        let attempt = 0;

        while (!decryptedBlock) {
            logger.debug(`Downloading`);
            attempt++;

            try {
                const [nodeKeys, encryptedBlock] = await Promise.all([
                    this.nodesService.getNodeKeys(nodeUid),
                    this.apiService.downloadBlock(bareUrl, token, undefined, signal),
                ]);

                if (!nodeKeys.contentKeyPacketSessionKey) {
                    throw new ValidationError(c('Error').t`File has no content key`);
                }

                logger.debug(`Decrypting`);
                decryptedBlock = await this.cryptoService.decryptThumbnail(
                    encryptedBlock,
                    nodeKeys.contentKeyPacketSessionKey,
                );
            } catch (error: unknown) {
                if (attempt <= MAX_THUMBNAIL_DOWNLOAD_ATTEMPTS) {
                    logger.warn(`Thumbnail download failed #${attempt}, retrying: ${getErrorMessage(error)}`);
                    continue;
                }

                logger.error(`Thumbnail download failed`, error);
                throw error;
            }
        }

        return decryptedBlock;
    }
}
