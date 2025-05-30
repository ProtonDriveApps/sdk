import { c } from "ttag";

import { Thumbnail, Logger, ThumbnailType, UploadMetadata } from "../../interface";
import { IntegrityError } from "../../errors";
import { LoggerWithPrefix } from "../../telemetry";
import { APIHTTPError, HTTPErrorCode, NotFoundAPIError } from "../apiService";
import { getErrorMessage } from "../errors";
import { mergeUint8Arrays } from "../utils";
import { waitForCondition } from '../wait';
import { UploadAPIService } from "./apiService";
import { BlockVerifier } from "./blockVerifier";
import { UploadController } from './controller';
import { UploadCryptoService } from "./cryptoService";
import { UploadDigests } from "./digests";
import { NodeRevisionDraft, EncryptedBlock, EncryptedThumbnail, EncryptedBlockMetadata } from "./interface";
import { UploadTelemetry } from './telemetry';
import { ChunkStreamReader } from './chunkStreamReader';
import { UploadManager } from "./manager";

/**
 * File chunk size in bytes representing the size of each block.
 */
export const FILE_CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Maximum number of blocks that can be buffered before upload.
 * This is to prevent using too much memory.
 */
const MAX_BUFFERED_BLOCKS = 15;

/**
 * Maximum number of blocks that can be uploaded at the same time.
 * This is to prevent overloading the server with too many requests.
 */
const MAX_UPLOADING_BLOCKS = 5;

/**
 * Maximum number of retries for block encryption.
 * This is to automatically retry random errors that can happen
 * during encryption, for example bitflips.
 */
const MAX_BLOCK_ENCRYPTION_RETRIES = 1;

/**
 * Maximum number of retries for block upload.
 * This is to ensure we don't end up in an infinite loop.
 */
const MAX_BLOCK_UPLOAD_RETRIES = 3;

/**
 * Fileuploader is responsible for uploading file content to the server.
 * 
 * It handles the encryption of file blocks and thumbnails, as well as
 * the upload process itself. It manages the upload queue and ensures
 * that the upload process is efficient and does not overload the server.
 */
export class Fileuploader {
    private logger: Logger;

    private digests: UploadDigests;
    private controller: UploadController;
    private abortController: AbortController;

    private encryptedThumbnails = new Map<ThumbnailType, EncryptedThumbnail>();
    private encryptedBlocks = new Map<number, EncryptedBlock>();
    private encryptionFinished = false;

    private ongoingUploads = new Map<string, {
        uploadPromise: Promise<void>,
        encryptedBlock: EncryptedBlock | EncryptedThumbnail,
    }>();
    private uploadedThumbnails: ({ type: ThumbnailType } & EncryptedBlockMetadata)[] = [];
    private uploadedBlocks: ({ index: number } & EncryptedBlockMetadata)[] = [];

    constructor(
        private telemetry: UploadTelemetry,
        private apiService: UploadAPIService,
        private cryptoService: UploadCryptoService,
        private uploadManager: UploadManager,
        private blockVerifier: BlockVerifier,
        private revisionDraft: NodeRevisionDraft,
        private metadata: UploadMetadata,
        private onFinish: (failure: boolean) => Promise<void>,
        private signal?: AbortSignal,
    ) {
        this.telemetry = telemetry;
        this.logger = telemetry.getLoggerForRevision(revisionDraft.nodeRevisionUid);
        this.apiService = apiService;
        this.cryptoService = cryptoService;
        this.blockVerifier = blockVerifier;
        this.revisionDraft = revisionDraft;
        this.metadata = metadata;
        this.onFinish = onFinish;

        this.signal = signal;
        this.abortController = new AbortController();
        if (signal) {
            signal.addEventListener('abort', () => {
                this.abortController.abort();
            });
        }

        this.digests = new UploadDigests();
        this.controller = new UploadController();
    }

    writeFile(fileObject: File, thumbnails: Thumbnail[], onProgress?: (uploadedBytes: number) => void): UploadController {
        if (this.controller.promise) {
            throw new Error(`Upload already started`);
        }
        if (!this.metadata.mediaType) {
            this.metadata.mediaType = fileObject.type;
        }
        if (!this.metadata.expectedSize) {
            this.metadata.expectedSize = fileObject.size;
        }
        if (!this.metadata.modificationTime) {
            this.metadata.modificationTime = new Date(fileObject.lastModified);
        }
        return this.writeStream(fileObject.stream(), thumbnails, onProgress);
    }

    writeStream(stream: ReadableStream, thumbnails: Thumbnail[], onProgress?: (uploadedBytes: number) => void): UploadController {
        if (this.controller.promise) {
            throw new Error(`Upload already started`);
        }
        this.controller.promise = this.uploadStream(stream, thumbnails, onProgress);
        return this.controller;
    }

    private async uploadStream(stream: ReadableStream, thumbnails: Thumbnail[], onProgress?: (uploadedBytes: number) => void): Promise<string> {
        let failure = false;

        // File progress is tracked for telemetry - to track at what
        // point the download failed.
        let fileProgress = 0;

        try {
            this.logger.info(`Starting upload`);
            await this.encryptAndUploadBlocks(stream, thumbnails, (uploadedBytes) => {
                fileProgress += uploadedBytes;
                onProgress?.(uploadedBytes);
            })

            this.logger.debug(`All blocks uploaded, committing`);
            await this.commitFile(thumbnails);

            void this.telemetry.uploadFinished(this.revisionDraft.nodeRevisionUid, fileProgress);
            this.logger.info(`Upload succeeded`);
        } catch (error: unknown) {
            failure = true;
            this.logger.error(`Upload failed`, error);
            void this.telemetry.uploadFailed(this.revisionDraft.nodeRevisionUid, error, fileProgress, this.metadata.expectedSize);
            throw error;
        } finally {
            this.logger.debug(`Upload cleanup`);

            // Help the garbage collector to clean up the memory.
            this.encryptedBlocks.clear();
            this.encryptedThumbnails.clear();
            this.ongoingUploads.clear();
            this.uploadedBlocks = [];
            this.uploadedThumbnails = [];
            this.encryptionFinished = false;

            await this.onFinish(failure);
        }

        return this.revisionDraft.nodeRevisionUid;
    }

    private async encryptAndUploadBlocks(stream: ReadableStream, thumbnails: Thumbnail[], onProgress?: (uploadedBytes: number) => void) {
        // We await for the encryption of thumbnails to finish before
        // starting the upload. This is because we need to request the
        // upload tokens for the thumbnails with the first blocks.
        await this.encryptThumbnails(thumbnails);

        // Encrypting blocks and uploading them is done in parallel.
        // For that reason, we want to await for the encryption later.
        // However, jest complains if encryptBlock rejects asynchronously.
        // For that reason we handle manually to save error to the variable
        // and throw if set after we await for the encryption.
        let encryptionError;
        const encryptBlocksPromise = this.encryptBlocks(stream).catch((error) => {
            encryptionError = error;
            void this.abortUpload(error);
        });

        while (!encryptionError) {
            await this.controller.waitIfPaused();
            await this.waitForUploadCapacityAndBufferedBlocks();

            if (this.isEncryptionFullyFinished) {
                break;
            }

            await this.requestAndInitiateUpload(onProgress);

            if (this.isEncryptionFullyFinished) {
                break;
            }
        }

        this.logger.debug(`All blocks uploading, waiting for them to finish`);
        // Technically this is finished as while-block above will break
        // when encryption is finished. But in case of error there could
        // be a race condition that would cause the encryptionError to
        // not be set yet.
        await encryptBlocksPromise;
        if (encryptionError) {
            throw encryptionError;
        }
        await Promise.all(this.ongoingUploads.values().map(({ uploadPromise }) => uploadPromise));
    }

    private async commitFile(thumbnails: Thumbnail[]) {
        this.verifyIntegrity(thumbnails);

        const uploadedBlocks = Array.from(this.uploadedBlocks.values());
        uploadedBlocks.sort((a, b) => a.index - b.index);

        const extendedAttributes = {
            modificationTime: this.metadata.modificationTime,
            size: this.metadata.expectedSize,
            blockSizes: uploadedBlocks.map(block => block.originalSize),
            digests: this.digests.digests(),
        };
        const encryptedSize = uploadedBlocks.reduce((sum, block) => sum + block.encryptedSize, 0);
        await this.uploadManager.commitDraft(
            this.revisionDraft,
            this.manifest,
            this.metadata,
            extendedAttributes,
            encryptedSize,
        );
    }

    private async encryptThumbnails(thumbnails: Thumbnail[]) {
        if (new Set(thumbnails.map(({ type }) => type)).size !== thumbnails.length) {
            throw new Error(`Duplicate thumbnail types`);
        }

        for (const thumbnail of thumbnails) {
            this.logger.debug(`Encrypting thumbnail ${thumbnail.type}`);
            const encryptedThumbnail = await this.cryptoService.encryptThumbnail(this.revisionDraft.nodeKeys, thumbnail);
            this.encryptedThumbnails.set(thumbnail.type, encryptedThumbnail);
        }
    }

    private async encryptBlocks(stream: ReadableStream) {
        try {
            let index = 0;
            const reader = new ChunkStreamReader(stream, FILE_CHUNK_SIZE);
            for await (const block of reader.iterateChunks()) {
                index++;

                this.digests.update(block);

                await this.controller.waitIfPaused();
                await this.waitForBufferCapacity();

                this.logger.debug(`Encrypting block ${index}`);
                let attempt = 0;
                let encryptedBlock;
                while (!encryptedBlock) {
                    attempt++;

                    try {
                        encryptedBlock = await this.cryptoService.encryptBlock(
                            (encryptedBlock) => this.blockVerifier.verifyBlock(encryptedBlock),
                            this.revisionDraft.nodeKeys,
                            block,
                            index,
                        );
                    } catch (error: unknown) {
                        if (attempt <= MAX_BLOCK_ENCRYPTION_RETRIES) {
                            this.logger.warn(`Block encryption failed #${attempt}, retrying: ${getErrorMessage(error)}`);
                            continue;
                        }

                        this.logger.error(`Failed to encrypt block ${index}`, error);
                        throw error;
                    }
                }
                this.encryptedBlocks.set(index, encryptedBlock);
            }
        } finally {
            this.encryptionFinished = true;
        }
    }

    private async requestAndInitiateUpload(onProgress?: (uploadedBytes: number) => void): Promise<void> {
        this.logger.info(`Requesting upload tokens for ${this.encryptedBlocks.size} blocks`);
        const uploadTokens = await this.apiService.requestBlockUpload(
            this.revisionDraft.nodeRevisionUid,
            this.revisionDraft.nodeKeys.signatureAddress.addressId,
            {
                contentBlocks: Array.from(this.encryptedBlocks.values().map(block => ({
                    index: block.index,
                    encryptedSize: block.encryptedSize,
                    hash: block.hash,
                    armoredSignature: block.armoredSignature,
                    verificationToken: block.verificationToken,
                }))),
                thumbnails: Array.from(this.encryptedThumbnails.values().map(block => ({
                    type: block.type,
                    encryptedSize: block.encryptedSize,
                    hash: block.hash,
                }))),
            },
        );

        for (const thumbnailToken of uploadTokens.thumbnailTokens) {
            let encryptedThumbnail = this.encryptedThumbnails.get(thumbnailToken.type);
            if (!encryptedThumbnail) {
                throw new Error(`Thumbnail ${thumbnailToken.type} not found`);
            }

            this.encryptedThumbnails.delete(thumbnailToken.type);

            const uploadKey = `thumbnail:${thumbnailToken.type}`;
            this.ongoingUploads.set(uploadKey, {
                uploadPromise: this.uploadThumbnail(
                    thumbnailToken,
                    encryptedThumbnail,
                    onProgress,
                ).finally(() => {
                    this.ongoingUploads.delete(uploadKey);

                    // Help the garbage collector to clean up the memory.
                    encryptedThumbnail = undefined;
                }),
                encryptedBlock: encryptedThumbnail,
            });
        }

        for (const blockToken of uploadTokens.blockTokens) {
            let encryptedBlock = this.encryptedBlocks.get(blockToken.index);
            if (!encryptedBlock) {
                throw new Error(`Block ${blockToken.index} not found`);
            }

            this.encryptedBlocks.delete(blockToken.index);

            const uploadKey = `block:${blockToken.index}`;
            this.ongoingUploads.set(uploadKey, {
                uploadPromise: this.uploadBlock(
                    blockToken,
                    encryptedBlock,
                    onProgress,
                ).finally(() => {
                    this.ongoingUploads.delete(uploadKey);

                    // Help the garbage collector to clean up the memory.
                    encryptedBlock = undefined;
                }),
                encryptedBlock,
            });
        }
    }

    private async uploadThumbnail(
        uploadToken: { bareUrl: string, token: string },
        encryptedThumbnail: EncryptedThumbnail,
        onProgress?: (uploadedBytes: number) => void,
    ) {
        const logger = new LoggerWithPrefix(this.logger, `thubmnail ${uploadToken.token}`);
        logger.info(`Upload started`);

        let blockProgress = 0;
        let attempt = 0;

        while (true) {
            attempt++;
            try {
                logger.debug(`Uploading`);
                await this.apiService.uploadBlock(
                    uploadToken.bareUrl,
                    uploadToken.token,
                    encryptedThumbnail.encryptedData,
                    (uploadedBytes) => {
                        blockProgress += uploadedBytes;
                        onProgress?.(uploadedBytes);
                    },
                    this.abortController.signal,
                )
                this.uploadedThumbnails.push({
                    type: encryptedThumbnail.type,
                    hash: encryptedThumbnail.hash,
                    encryptedSize: encryptedThumbnail.encryptedSize,
                    originalSize: encryptedThumbnail.originalSize,
                })
                break;
            } catch (error: unknown) {
                if (blockProgress !== 0) {
                    onProgress?.(-blockProgress);
                    blockProgress = 0;
                }

                // Note: We don't handle token expiration for thumbnails, because
                // the API requires the thumbnails to be requested with the first
                // upload block request. Thumbnails are tiny, so this edge case
                // should be very rare and considering it is the beginning of the
                // upload, the whole retry is cheap.

                // Upload can fail for various reasons, for example integrity
                // can fail due to bitflips. We want to retry and solve the issue
                // seamlessly for the user. We retry only once, because we don't
                // want to get stuck in a loop.
                if (attempt <= MAX_BLOCK_UPLOAD_RETRIES) {
                    logger.warn(`Upload failed #${attempt}, retrying: ${getErrorMessage(error)}`);
                    continue;
                }

                logger.error(`Upload failed`, error);
                await this.abortUpload(error);
                throw error;
            }
        }

        logger.info(`Uploaded`);
    }

    private async uploadBlock(
        uploadToken: { index: number, bareUrl: string, token: string },
        encryptedBlock: EncryptedBlock,
        onProgress?: (uploadedBytes: number) => void,
    ) {
        const logger = new LoggerWithPrefix(this.logger, `block ${uploadToken.index}:${uploadToken.token}`);
        logger.info(`Upload started`);

        let blockProgress = 0;
        let attempt = 0;

        while (true) {
            attempt++;
            try {
                logger.debug(`Uploading`);
                await this.apiService.uploadBlock(
                    uploadToken.bareUrl,
                    uploadToken.token,
                    encryptedBlock.encryptedData,
                    (uploadedBytes) => {
                        blockProgress += uploadedBytes;
                        onProgress?.(uploadedBytes);
                    },
                    this.abortController.signal,
                )
                this.uploadedBlocks.push({
                    index: encryptedBlock.index,
                    hash: encryptedBlock.hash,
                    encryptedSize: encryptedBlock.encryptedSize,
                    originalSize: encryptedBlock.originalSize,
                })
                break;
            } catch (error: unknown) {
                if (blockProgress !== 0) {
                    onProgress?.(-blockProgress);
                    blockProgress = 0;
                }

                if (
                    (error instanceof APIHTTPError && error.statusCode === HTTPErrorCode.NOT_FOUND) ||
                    (error instanceof NotFoundAPIError)
                ) {
                    logger.warn(`Token expired, fetching new token and retrying`);
                    const uploadTokens = await this.apiService.requestBlockUpload(
                        this.revisionDraft.nodeRevisionUid,
                        this.revisionDraft.nodeKeys.signatureAddress.addressId,
                        {
                            contentBlocks: [{
                                index: encryptedBlock.index,
                                encryptedSize: encryptedBlock.encryptedSize,
                                hash: encryptedBlock.hash,
                                armoredSignature: encryptedBlock.armoredSignature,
                                verificationToken: encryptedBlock.verificationToken,
                            }],
                        },
                    );
                    uploadToken = uploadTokens.blockTokens[0];
                    continue;
                }

                // Upload can fail for various reasons, for example integrity
                // can fail due to bitflips. We want to retry and solve the issue
                // seamlessly for the user. We retry only once, because we don't
                // want to get stuck in a loop.
                if (attempt <= MAX_BLOCK_UPLOAD_RETRIES) {
                    logger.warn(`Upload failed #${attempt}, retrying: ${getErrorMessage(error)}`);
                    continue;
                }

                logger.error(`Upload failed`, error);
                await this.abortUpload(error);
                throw error;
            }
        }

        logger.info(`Uploaded`);
    }

    private async waitForBufferCapacity() {
        if (this.encryptedBlocks.size >= MAX_BUFFERED_BLOCKS) {
            await waitForCondition(() => this.encryptedBlocks.size < MAX_BUFFERED_BLOCKS);
        }
    }

    private async waitForUploadCapacityAndBufferedBlocks() {
        while (this.ongoingUploads.size >= MAX_UPLOADING_BLOCKS) {
            await Promise.race(this.ongoingUploads.values().map(({ uploadPromise }) => uploadPromise));
        }
        await waitForCondition(() => this.encryptedBlocks.size > 0 || this.encryptionFinished);
    }

    private verifyIntegrity(thumbnails: Thumbnail[]) {
        const expectedBlockCount = Math.ceil(this.metadata.expectedSize / FILE_CHUNK_SIZE) + (thumbnails ? thumbnails?.length : 0);
        if (this.uploadedBlockCount !== expectedBlockCount) {
            throw new IntegrityError(c('Error').t`Some file parts failed to upload`, {
                uploadedBlockCount: this.uploadedBlockCount,
                expectedBlockCount,
            });
        }
        if (this.uploadedOriginalFileSize !== this.metadata.expectedSize) {
            throw new IntegrityError(c('Error').t`Some file bytes failed to upload`, {
                uploadedOriginalFileSize: this.uploadedOriginalFileSize,
                expectedFileSize: this.metadata.expectedSize,
            });
        }
    }

    /**
     * Check if the encryption is fully finished.
     * This means that all blocks and thumbnails have been encrypted and
     * requested to be uploaded, and there are no more blocks or thumbnails
     * to encrypt and upload.
     */
    private get isEncryptionFullyFinished(): boolean {
        return this.encryptionFinished && this.encryptedBlocks.size === 0 && this.encryptedThumbnails.size === 0;
    }

    private get uploadedBlockCount(): number {
        return this.uploadedBlocks.length + this.uploadedThumbnails.length;
    }

    private get uploadedOriginalFileSize(): number {
        return this.uploadedBlocks.reduce((sum, { originalSize }) => sum + originalSize, 0);
    }

    private get manifest(): Uint8Array {
        this.uploadedThumbnails.sort((a, b) => a.type - b.type);
        this.uploadedBlocks.sort((a, b) => a.index - b.index);
        const hashes = [
            ...this.uploadedThumbnails.map(({ hash }) => hash),
            ...this.uploadedBlocks.map(({ hash }) => hash),
        ];
        return mergeUint8Arrays(hashes);
    }

    private async abortUpload(error: unknown) {
        if (this.abortController.signal.aborted || this.signal?.aborted) {
            return;
        }
        this.abortController.abort(error);
    }
}
